"""Per-user sliding-window rate limiter for expensive endpoints.

Guards the inference-heavy paths (``POST /predictions/predict/{id}`` and
``POST /scans/upload``) against accidental or malicious floods.

Backed by :class:`app.core.stores.SlidingWindowStore`: in-process by default
(adequate for the shipped single-worker deployment), Redis-shared when
``USE_REDIS=true`` so the limits hold across multiple workers/instances.

Keys are ``scope:client_ip:user_id`` so one user cannot exhaust another's
budget, and IP rotation alone cannot bypass the per-user share.
"""

from fastapi import HTTPException, Request, status

from app.core.netutil import client_ip
from app.core.stores import get_security_store


class SlidingWindowRateLimiter:
    def __init__(self, window_seconds: int, scope: str, settings_key: str):
        """
        ``settings_key`` names the ``Settings`` field that holds this
        limiter's per-minute budget (env-configurable, e.g.
        ``UPLOAD_RATE_LIMIT_PER_MINUTE``).
        """
        self.window_seconds = window_seconds
        self.scope = scope
        self.settings_key = settings_key

    def _limit(self) -> int:
        from app.core.config import get_settings
        return max(1, int(getattr(get_settings(), self.settings_key)))

    def _key(self, request: Request, user_id: int | None) -> str:
        return f"{self.scope}:{client_ip(request)}:{user_id or 'anon'}"

    async def check(self, request: Request, user_id: int | None) -> None:
        store = get_security_store()
        key = self._key(request, user_id)
        if await store.is_over_limit(key, self.window_seconds, self._limit()):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again in a minute.",
                headers={"Retry-After": str(self.window_seconds)},
            )
        await store.record(key, self.window_seconds)

    async def clear(self) -> None:
        """Drop this limiter's windows (used by tests for isolation)."""
        await get_security_store().clear_all()


# Budgets are read from Settings (``UPLOAD_RATE_LIMIT_PER_MINUTE`` /
# ``PREDICT_RATE_LIMIT_PER_MINUTE``) so they are overridable per environment
# without code changes. Default 30/min per user caps runaway loops while
# staying generous for a demo.
upload_limiter = SlidingWindowRateLimiter(window_seconds=60, scope="upload", settings_key="upload_rate_limit_per_minute")
predict_limiter = SlidingWindowRateLimiter(window_seconds=60, scope="predict", settings_key="predict_rate_limit_per_minute")
