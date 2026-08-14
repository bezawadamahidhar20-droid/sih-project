from collections import defaultdict
from datetime import timedelta
from time import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_current_active_user, require_roles
from app.api.schemas import (
    UserCreate, UserResponse, UserUpdate, UserSelfUpdate, ChangePasswordRequest,
    Token, LoginRequest, RefreshTokenRequest, LogoutRequest,
)
from app.core.config import get_settings
from app.core.netutil import client_ip
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, create_refresh_token_with_jti,
    decode_token
)
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.db.models import User, UserRole, RefreshSession
from app.core.logging import audit_logger

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["authentication"])

# ---------------------------------------------------------------------------
# Brute-force protection for the login endpoint.
#
# A small in-process sliding-window limiter keyed by client IP + username.
# Acceptable for the single-worker deployment this stack ships with; swap for
# a shared store (Redis) or nginx ``limit_req`` when scaling horizontally.
# ---------------------------------------------------------------------------
_LOGIN_FAILURES: Dict[str, List[float]] = defaultdict(list)
LOGIN_MAX_ATTEMPTS = 5
LOGIN_WINDOW_SECONDS = 15 * 60  # 15 minutes

# One-time-use refresh tokens (rotation): jti -> expiry epoch. Legacy
# in-process store kept ONLY as a backstop for refresh tokens minted before
# the persistent RefreshSession table existed (e.g. tests that call
# create_refresh_token directly). API-minted tokens are tracked in the DB
# (see RefreshSession), which survives restarts and scales horizontally.
# Bounded below by expiring + a hard cap.
_CONSUMED_REFRESH_JTIS: Dict[str, float] = {}
_MAX_CONSUMED_JTIS = 10_000

# Precomputed bcrypt hash used to equalize response timing when the username
# does not exist, so account existence cannot be probed by latency.
_DUMMY_HASH = get_password_hash("timing-equalization-dummy-value")


def _rate_limit_key(request: Request, username: str) -> str:
    # Uses the proxy-aware client IP (nginx X-Forwarded-For) so all requests
    # behind the reverse proxy are NOT treated as one shared client — five
    # failed attempts from one attacker can no longer lock out a real user.
    return f"{client_ip(request)}:{username.lower()}"


def _prune_login_failures(now: float) -> None:
    """Drop keys that have gone quiet so random-username floods cannot grow
    the store without bound (keys are normally pruned on re-check only)."""
    for stale in [
        k for k, v in _LOGIN_FAILURES.items()
        if not v or now - v[-1] >= LOGIN_WINDOW_SECONDS
    ]:
        _LOGIN_FAILURES.pop(stale, None)


def _login_blocked(key: str) -> bool:
    now = time()
    recent = [t for t in _LOGIN_FAILURES[key] if now - t < LOGIN_WINDOW_SECONDS]
    _LOGIN_FAILURES[key] = recent
    _prune_login_failures(now)
    return len(recent) >= LOGIN_MAX_ATTEMPTS


def _consume_refresh_jti(payload: Dict[str, Any]) -> None:
    """Mark a refresh token's jti as used (one-time rotation)."""
    jti = payload.get("jti")
    if not jti:
        return
    now = time()
    for stale in [k for k, exp in _CONSUMED_REFRESH_JTIS.items() if exp <= now]:
        _CONSUMED_REFRESH_JTIS.pop(stale, None)
    if len(_CONSUMED_REFRESH_JTIS) >= _MAX_CONSUMED_JTIS:
        # Stay bounded without wiping recent entries (a full clear would
        # reopen a replay window for already-consumed tokens): drop the half
        # with the oldest expiry.
        oldest = sorted(_CONSUMED_REFRESH_JTIS.items(), key=lambda kv: kv[1])[
            : len(_CONSUMED_REFRESH_JTIS) // 2
        ]
        for key, _ in oldest:
            _CONSUMED_REFRESH_JTIS.pop(key, None)
    exp = payload.get("exp")
    _CONSUMED_REFRESH_JTIS[jti] = float(exp) if isinstance(exp, (int, float)) else now + LOGIN_WINDOW_SECONDS


def _register_login_failure(key: str) -> None:
    _LOGIN_FAILURES[key].append(time())


def _clear_login_failures(key: str) -> None:
    _LOGIN_FAILURES.pop(key, None)


async def _persist_refresh_session(db: AsyncSession, user_id: int, jti: str) -> None:
    """Record a newly-issued refresh token in durable storage.

    DB columns store naive-UTC (matching the rest of the schema, see
    ``utcnow``), so expiry is computed with ``utcnow()`` — never mix aware
    datetimes into the ``DateTime`` columns.
    """
    db.add(
        RefreshSession(
            user_id=user_id,
            jti=jti,
            expires_at=utcnow() + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )


async def _prune_expired_refresh_sessions(db: AsyncSession) -> None:
    """Bound table growth: drop expired rows occasionally (once per login)."""
    await db.execute(
        delete(RefreshSession).where(RefreshSession.expires_at < utcnow())
    )


async def _revoke_refresh_session(db: AsyncSession, jti: str) -> bool:
    """Mark a refresh token consumed. Returns True if a DB row existed."""
    result = await db.execute(select(RefreshSession).where(RefreshSession.jti == jti))
    row = result.scalar_one_or_none()
    if row is None:
        return False
    if row.revoked_at is None:
        row.revoked_at = utcnow()
    return True


async def _revoke_all_user_sessions(db: AsyncSession, user_id: int) -> None:
    """Revoke every outstanding refresh session for a user (family kill)."""
    await db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utcnow())
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    hashed_password = get_password_hash(user_data.password)

    user = User(
        username=user_data.username,
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        role=user_data.role,
    )

    db.add(user)
    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    audit_logger.log_auth("register", user_id=str(user.id), username=user.username, success=True)

    return user


@router.post("/login", response_model=Token)
async def login(
    credentials: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    key = _rate_limit_key(request, credentials.username)
    if _login_blocked(key):
        audit_logger.log_auth("login", username=credentials.username, success=False)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed login attempts. Try again in 15 minutes.",
            headers={"Retry-After": str(LOGIN_WINDOW_SECONDS)},
        )

    result = await db.execute(select(User).where(User.username == credentials.username))
    user = result.scalar_one_or_none()

    if not user:
        # Equalize response timing: run bcrypt against a dummy hash so a
        # nonexistent username is not distinguishable from a wrong password
        # by request latency (~250ms bcrypt vs. near-instant miss).
        verify_password(credentials.password, _DUMMY_HASH)
        _register_login_failure(key)
        audit_logger.log_auth(
            "login", username=credentials.username, success=False,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not verify_password(credentials.password, user.hashed_password):
        _register_login_failure(key)
        audit_logger.log_auth(
            "login", username=credentials.username, success=False,
            ip_address=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    _clear_login_failures(key)
    user.last_login = utcnow()

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "ver": user.token_version}
    )
    refresh_token, refresh_jti = create_refresh_token_with_jti(
        data={"sub": str(user.id), "role": user.role.value, "ver": user.token_version}
    )
    await _persist_refresh_session(db, user.id, refresh_jti)
    await _prune_expired_refresh_sessions(db)
    await db.commit()

    audit_logger.log_auth("login", user_id=str(user.id), username=user.username, success=True)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    payload = decode_token(request.refresh_token)

    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    # Rotation + replay detection. Each refresh token is single-use.
    #   * API-minted tokens carry a DB row (RefreshSession): a consumed row
    #     is a REPLAY — revoke the user's whole session family and bump their
    #     token_version so the stolen access token dies too.
    #   * Legacy tokens (minted before RefreshSession existed) fall back to
    #     the in-memory consumed set, burned-then-verified with no await in
    #     between so two concurrent refreshes cannot both pass.
    jti = payload.get("jti")
    replay = False
    if jti:
        row_result = await db.execute(select(RefreshSession).where(RefreshSession.jti == jti))
        row = row_result.scalar_one_or_none()
        if row is not None:
            now = utcnow()
            if row.revoked_at is not None:
                replay = True
            elif row.expires_at < now:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token expired"
                )
            else:
                row.revoked_at = now  # rotate: this token is now spent
        else:
            # No DB row: legacy token — use the in-memory consumed set.
            if jti in _CONSUMED_REFRESH_JTIS:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token already used"
                )
            _consume_refresh_jti(payload)

    try:
        user_id = int(payload.get("sub") or "")
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive"
        )

    # Revocation: tokens minted before the last password/role change are dead.
    if (payload.get("ver") or 0) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked — please sign in again"
        )

    if replay:
        # A consumed refresh token was presented again: assume theft, kill the
        # entire session family (every refresh token + every access token via
        # the version bump) and reject.
        await _revoke_all_user_sessions(db, user.id)
        user.token_version = (user.token_version or 0) + 1
        await db.commit()
        audit_logger.log_auth(
            "refresh_replay_detected", user_id=str(user.id),
            username=user.username, success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token already used — all sessions revoked, please sign in again"
        )

    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value, "ver": user.token_version}
    )
    new_refresh_token, new_refresh_jti = create_refresh_token_with_jti(
        data={"sub": str(user.id), "role": user.role.value, "ver": user.token_version}
    )
    await _persist_refresh_session(db, user.id, new_refresh_jti)
    await db.commit()

    audit_logger.log_auth(
        "refresh", user_id=str(user.id), username=user.username, success=True,
    )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer"
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: LogoutRequest,
    db: AsyncSession = Depends(get_db),
):
    """Server-side logout: revoke the presented refresh token so it can never
    be replayed or refreshed again. The short-lived access token naturally
    expires on its own (default 30 min). Public + idempotent on purpose: the
    only effect of a forged call is revoking a token the caller already
    possessed, which is exactly what a legitimate logout should do.
    """
    if request.refresh_token:
        payload = decode_token(request.refresh_token)
        if payload and payload.get("type") == "refresh":
            jti = payload.get("jti")
            if jti:
                await _revoke_refresh_session(db, jti)
                _consume_refresh_jti(payload)
            username = None
            user_id = None
            try:
                user_id = int(payload.get("sub") or "")
            except (TypeError, ValueError):
                pass
            audit_logger.log_auth(
                "logout", user_id=str(user_id), username=username, success=True,
            )
            await db.commit()
    return None


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    user_update: UserSelfUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """Update own profile.

    Only ``email`` / ``full_name`` are accepted. Role and active-status
    changes are privileged and go through ``PATCH /auth/users/{id}``.
    """
    update_data = user_update.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)

    return current_user


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    if not verify_password(request.current_password, current_user.hashed_password):
        audit_logger.log_auth(
            "change_password", user_id=str(current_user.id),
            username=current_user.username, success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    current_user.hashed_password = get_password_hash(request.new_password)
    # Revoke every outstanding access/refresh token issued before this point.
    current_user.token_version = (current_user.token_version or 0) + 1
    await db.commit()

    audit_logger.log_auth(
        "change_password", user_id=str(current_user.id),
        username=current_user.username, success=True,
    )


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    user_update: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = user_update.model_dump(exclude_unset=True)

    # Self-protection: nobody can change their own role or active status
    # through this endpoint (a doctor must not be able to deactivate
    # themselves or the other privileged users).
    if user.id == current_user.id and (
        "role" in update_data or "is_active" in update_data
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role or active status"
        )

    if "role" in update_data or "is_active" in update_data:
        # Privilege/status change: revoke the target user's sessions.
        user.token_version = (user.token_version or 0) + 1

    for field, value in update_data.items():
        setattr(user, field, value)

    await db.commit()
    await db.refresh(user)

    return user
