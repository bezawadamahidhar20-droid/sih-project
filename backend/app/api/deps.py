from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError

from app.core.config import get_settings
from app.core.security import decode_token
from app.db.session import get_db
from app.db.models import User, UserRole
from app.core.logging import get_logger

settings = get_settings()
logger = get_logger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
http_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: AsyncSession = Depends(get_db)
) -> User:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    payload = decode_token(token)
    
    if not payload or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    try:
        parsed_user_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
        )

    result = await db.execute(select(User).where(User.id == parsed_user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )

    # Token revocation: a missing ``ver`` claim counts as version 0 (tokens
    # issued before token_version existed), so once a user's version is bumped
    # (password change, role change) every older token is rejected.
    if (payload.get("ver") or 0) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token revoked — please sign in again",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    return current_user


def require_roles(*allowed_roles: UserRole):
    def role_checker(current_user: User = Depends(get_current_active_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {', '.join([r.value for r in allowed_roles])}"
            )
        return current_user
    return role_checker


require_doctor = require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST)
require_staff_or_above = require_roles(UserRole.DOCTOR, UserRole.RADIOLOGIST, UserRole.STAFF)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(http_bearer),
    db: AsyncSession = Depends(get_db)
) -> Optional[User]:
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials, db)
    except HTTPException:
        return None


def rate_limit(limiter):
    """Dependency factory: enforce a sliding-window rate limit per user.

    Usage: ``_rate_limited: None = Depends(rate_limit(predict_limiter))``
    on an expensive endpoint. Returns 429 when the per-user budget in the
    current window is exhausted.
    """
    def _checker(
        request: Request,
        current_user: User = Depends(get_current_active_user),
    ) -> None:
        limiter.check(request, current_user.id)
    return _checker