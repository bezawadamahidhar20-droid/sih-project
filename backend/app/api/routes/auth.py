import secrets
from datetime import timedelta
from time import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update
from sqlalchemy.exc import IntegrityError

from app.api.deps import get_current_active_user, require_roles
from app.api.schemas import (
    UserCreate, UserResponse, UserUpdate, UserSelfUpdate, ChangePasswordRequest,
    AuthSuccess, LoginRequest, RefreshTokenRequest, LogoutRequest,
)
from app.core.config import get_settings
from app.core.netutil import client_ip
from app.core.security import (
    verify_password, get_password_hash,
    create_access_token, create_refresh_token, create_refresh_token_with_jti,
    decode_token
)
from app.core.stores import get_security_store
from app.core.timeutil import utcnow
from app.db.session import get_db
from app.db.models import User, UserRole, RefreshSession
from app.core.logging import audit_logger

settings = get_settings()
router = APIRouter(prefix="/auth", tags=["authentication"])

# ---------------------------------------------------------------------------
# Brute-force protection for the login endpoint.
#
# Sliding-window limiter keyed by client IP + username, backed by the shared
# security store (in-process for the single-worker stack; Redis when
# USE_REDIS=true so lockouts hold across workers/instances).
# ---------------------------------------------------------------------------
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

# Cookie names for the HttpOnly/Secure/SameSite authentication cookies.
ACCESS_COOKIE = "access_token"
REFRESH_COOKIE = "refresh_token"
CSRF_COOKIE = "csrf_token"


def _rate_limit_key(request: Request, username: str) -> str:
    # Uses the proxy-aware client IP (nginx X-Forwarded-For) so all requests
    # behind the reverse proxy are NOT treated as one shared client — five
    # failed attempts from one attacker can no longer lock out a real user.
    return f"login:{client_ip(request)}:{username.lower()}"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    """Set the HttpOnly authentication cookies.

    * ``access_token`` — HttpOnly, SameSite=Lax, Path=/ (sent with every
      API request, still not readable by JavaScript).
    * ``refresh_token`` — HttpOnly, SameSite=Strict, scoped to the auth
      prefix so it is only ever sent to the auth endpoints; Strict means it
      is never forwarded cross-site.
    * ``csrf_token`` — NOT HttpOnly (the SPA must read it back for the
      double-submit CSRF header); it is a random non-credential, safe to
      expose to the page it belongs to.
    """
    response.set_cookie(
        key=ACCESS_COOKIE,
        value=access_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        max_age=settings.jwt_access_token_expire_minutes * 60,
    )
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/api/v1/auth",
        max_age=settings.jwt_refresh_token_expire_days * 86400,
    )
    response.set_cookie(
        key=CSRF_COOKIE,
        value=secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    """Expire every auth cookie (logout). Same attributes as set so the
    browser matches them for deletion."""
    for name, path in ((ACCESS_COOKIE, "/"), (REFRESH_COOKIE, "/api/v1/auth"), (CSRF_COOKIE, "/")):
        response.delete_cookie(key=name, path=path, secure=settings.cookie_secure, httponly=(name != CSRF_COOKIE), samesite="lax")


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


@router.post("/login", response_model=AuthSuccess)
async def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    store = get_security_store()
    key = _rate_limit_key(request, credentials.username)
    if await store.is_over_limit(key, LOGIN_WINDOW_SECONDS, LOGIN_MAX_ATTEMPTS):
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
        await store.record(key, LOGIN_WINDOW_SECONDS)
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
        await store.record(key, LOGIN_WINDOW_SECONDS)
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

    await store.reset(key)
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

    # HttpOnly/Secure/SameSite cookies carry the session for the browser
    # SPA (tokens stay out of JavaScript). The JSON body is kept for
    # programmatic clients and tests; the SPA ignores it.
    _set_auth_cookies(response, access_token, refresh_token)

    audit_logger.log_auth("login", user_id=str(user.id), username=user.username, success=True)

    # The session lives in the HttpOnly cookies just set. The JSON body
    # carries NO JWT: browser JS can read the body but not the HttpOnly
    # cookies, so echoing tokens here would defeat the point of HttpOnly.
    return {"message": "Authenticated"}


@router.post("/refresh", response_model=AuthSuccess)
async def refresh_token(
    body: RefreshTokenRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    # Accept the refresh token from the HttpOnly cookie (browser SPA) or the
    # JSON body (programmatic clients / tests).
    refresh_token_value = body.refresh_token or request.cookies.get(REFRESH_COOKIE)
    if not refresh_token_value:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token"
        )
    payload = decode_token(refresh_token_value)

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
        # ATOMIC single-use consume (DB-backed tokens). One UPDATE flips
        # revoked_at from NULL; ``rowcount == 1`` means THIS request won the
        # rotation. Because the flip is a single conditional UPDATE, two
        # concurrent refreshes presenting the same token can never both pass
        # (the old SELECT-then-update had a TOCTOU window that let concurrent
        # requests each mint a replacement pair — observed live under
        # PostgreSQL with 20 parallel refreshes).
        now = utcnow()
        consumed = await db.execute(
            update(RefreshSession)
            .where(
                RefreshSession.jti == jti,
                RefreshSession.revoked_at.is_(None),
                RefreshSession.expires_at >= now,
            )
            .values(revoked_at=now)
            .execution_options(synchronize_session=False)
        )
        if consumed.rowcount != 1:
            # UPDATE matched nothing: the token is already revoked (replay),
            # expired, or has no DB row (legacy token). Distinguish.
            row_result = await db.execute(
                select(RefreshSession).where(RefreshSession.jti == jti)
            )
            row = row_result.scalar_one_or_none()
            if row is None:
                # No DB row: legacy token — use the in-memory consumed set.
                if jti in _CONSUMED_REFRESH_JTIS:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Refresh token already used"
                    )
                _consume_refresh_jti(payload)
            elif row.revoked_at is not None:
                replay = True
            else:
                # Row exists and is not revoked, so the UPDATE only failed
                # because the session has expired.
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Refresh token expired"
                )

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

    _set_auth_cookies(response, access_token, new_refresh_token)

    audit_logger.log_auth(
        "refresh", user_id=str(user.id), username=user.username, success=True,
    )

    # Same contract as login: rotated tokens travel ONLY in the HttpOnly
    # cookies; the JSON body contains no JWT material.
    return {"message": "Token refreshed"}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    body: LogoutRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    """Server-side logout: revoke the presented refresh token (from the
    HttpOnly cookie or the JSON body) so it can never be replayed or
    refreshed again, then clear the auth cookies. The short-lived access
    token naturally expires on its own (default 30 min). Public + idempotent
    on purpose: the only effect of a forged call is revoking a token the
    caller already possessed, which is exactly what a legitimate logout
    should do.
    """
    refresh_token_value = body.refresh_token or request.cookies.get(REFRESH_COOKIE)
    if refresh_token_value:
        payload = decode_token(refresh_token_value)
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
    _clear_auth_cookies(response)
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
