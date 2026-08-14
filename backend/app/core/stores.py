"""Shared security state: sliding-window rate limiting + login lockout.

Two implementations behind one interface:

* :class:`InMemorySlidingWindowStore` — the default. Used for local dev and
  the single-worker deployment this stack ships with. State is process-local.
* :class:`RedisSlidingWindowStore` — shared across workers/instances. Selected
  with ``USE_REDIS=true`` (a reachable ``REDIS_URL`` is required). Required
  before scaling ``WORKERS`` above 1 (enforced by the config validator).

Refresh-token state is NOT stored here — it lives in the ``refresh_sessions``
table, which is durable and multi-worker safe by itself.
"""

import threading
import time
from abc import ABC, abstractmethod
from collections import defaultdict
from typing import Dict, List

from app.core.config import get_settings


class SlidingWindowStore(ABC):
    """Async sliding-window event store.

    ``is_over_limit`` must be called BEFORE ``record`` (like the classic
    check-then-consume pattern) so the window reflects only prior events.
    """

    @abstractmethod
    async def is_over_limit(self, key: str, window_seconds: int, limit: int) -> bool:
        """True when ``limit`` or more events for ``key`` occurred within the window."""

    @abstractmethod
    async def record(self, key: str, window_seconds: int) -> None:
        """Record one event for ``key``."""

    @abstractmethod
    async def reset(self, key: str) -> None:
        """Drop all events for ``key`` (e.g. clear failures on successful login)."""

    @abstractmethod
    async def clear_all(self) -> None:
        """Drop every window (used by tests / maintenance)."""


class InMemorySlidingWindowStore(SlidingWindowStore):
    """Process-local sliding window. Adequate for the single-worker stack."""

    def __init__(self) -> None:
        self._windows: Dict[str, List[float]] = defaultdict(list)
        self._lock = threading.Lock()
        self._MAX_KEYS = 10_000

    async def is_over_limit(self, key: str, window_seconds: int, limit: int) -> bool:
        now = time.time()
        with self._lock:
            recent = [t for t in self._windows.get(key, []) if now - t < window_seconds]
            self._windows[key] = recent
            return len(recent) >= limit

    async def record(self, key: str, window_seconds: int) -> None:
        now = time.time()
        with self._lock:
            recent = [t for t in self._windows.get(key, []) if now - t < window_seconds]
            recent.append(now)
            self._windows[key] = recent
            if len(self._windows) > self._MAX_KEYS:
                for stale in [
                    k for k, v in self._windows.items()
                    if not v or now - v[-1] >= window_seconds
                ]:
                    self._windows.pop(stale, None)

    async def reset(self, key: str) -> None:
        with self._lock:
            self._windows.pop(key, None)

    async def clear_all(self) -> None:
        with self._lock:
            self._windows.clear()


class RedisSlidingWindowStore(SlidingWindowStore):
    """Redis sorted-set sliding window, shared across workers/instances.

    Requires ``redis`` (added to requirements.txt). Keys are namespaced with
    ``mediscan:rl:`` and expire a window after the window itself, so memory is
    bounded without manual cleanup.
    """

    _PREFIX = "mediscan:rl:"

    def __init__(self, redis_url: str) -> None:
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(redis_url, decode_responses=True)

    async def is_over_limit(self, key: str, window_seconds: int, limit: int) -> bool:
        rkey = self._PREFIX + key
        now = time.time()
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(rkey, 0, now - window_seconds)
            pipe.zcard(rkey)
            results = await pipe.execute()
        return int(results[1]) >= limit

    async def record(self, key: str, window_seconds: int) -> None:
        rkey = self._PREFIX + key
        now = time.time()
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zadd(rkey, {str(now): now})
            pipe.zremrangebyscore(rkey, 0, now - window_seconds)
            pipe.expire(rkey, window_seconds + 60)
            await pipe.execute()

    async def reset(self, key: str) -> None:
        await self._redis.delete(self._PREFIX + key)

    async def clear_all(self) -> None:
        # Only used by the test suite (in-memory path); not intended for
        # production. Redis keys expire on their own via EXPIRE.
        pass


_store: SlidingWindowStore | None = None


def get_security_store() -> SlidingWindowStore:
    """Return the shared security store (singleton). Redis when USE_REDIS=true,
    otherwise the in-process implementation."""
    global _store
    if _store is None:
        settings = get_settings()
        if settings.use_redis:
            _store = RedisSlidingWindowStore(settings.redis_url)
        else:
            _store = InMemorySlidingWindowStore()
    return _store
