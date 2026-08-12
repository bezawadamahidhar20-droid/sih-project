"""In-process sliding-window rate limiter for expensive endpoints.

Guards the inference-heavy paths (``POST /predictions/predict/{id}`` and
``POST /scans/upload``) against accidental or malicious floods. Like the
login limiter in ``auth.py`` this is an in-memory, per-process store —
adequate for the single-worker deployment this stack ships with (see the
backend ``Dockerfile``); swap for Redis or nginx ``limit_req`` when scaling
horizontally.

Keys are ``scope:client_ip:user_id`` so one user cannot exhaust another's
budget, and IP rotation alone cannot bypass the per-user share.
"""

from collections import defaultdict
from time import time
from typing import Dict, List, Optional

from fastapi import HTTPException, Request, status

from app.core.netutil import client_ip

_windows: Dict[str, List[float]] = defaultdict(list)


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
        self._checks = 0

    def _limit(self) -> int:
        from app.core.config import get_settings
        return max(1, int(getattr(get_settings(), self.settings_key)))

    def _key(self, request: Request, user_id: Optional[int]) -> str:
        return f"{self.scope}:{client_ip(request)}:{user_id or 'anon'}"

    def check(self, request: Request, user_id: Optional[int]) -> None:
        now = time()
        key = self._key(request, user_id)
        # Prune this key's stale entries every call; sweep the global store
        # only occasionally so a busy server does not pay an O(keys) scan on
        # every single request while still keeping memory bounded.
        recent = [t for t in _windows[key] if now - t < self.window_seconds]
        _windows[key] = recent
        self._checks += 1
        if self._checks % 100 == 0:
            for stale in [k for k, v in _windows.items() if not v or now - v[-1] >= self.window_seconds]:
                _windows.pop(stale, None)

        if len(recent) >= self._limit():
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again in a minute.",
                headers={"Retry-After": str(self.window_seconds)},
            )
        _windows[key] = recent + [now]

    def clear(self) -> None:
        """Drop this limiter's windows (used by tests for isolation)."""
        prefix = f"{self.scope}:"
        for key in [k for k in _windows if k.startswith(prefix)]:
            _windows.pop(key, None)


# Budgets are read from Settings (``UPLOAD_RATE_LIMIT_PER_MINUTE`` /
# ``PREDICT_RATE_LIMIT_PER_MINUTE``) so they are overridable per environment
# without code changes. Default 30/min per user caps runaway loops while
# staying generous for a demo.
upload_limiter = SlidingWindowRateLimiter(window_seconds=60, scope="upload", settings_key="upload_rate_limit_per_minute")
predict_limiter = SlidingWindowRateLimiter(window_seconds=60, scope="predict", settings_key="predict_rate_limit_per_minute")
