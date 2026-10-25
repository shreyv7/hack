"""Redis client with graceful fallback when REDIS_URL is unset."""

from __future__ import annotations

import json
import logging
from functools import lru_cache
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_redis():
    """Return a Redis client, or None if REDIS_URL is not configured."""
    if not settings.REDIS_URL:
        return None
    try:
        import redis

        client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.ping()
        return client
    except Exception as exc:  # noqa: BLE001 — degrade to DB path
        logger.warning("Redis unavailable (%s); using in-process decision cache only", exc)
        return None


class DecisionCache:
    """Short-TTL decision cache — Redis when available, else in-process dict."""

    def __init__(self) -> None:
        self._local: dict[str, tuple[float, str]] = {}

    def _redis_key(self, key: str) -> str:
        return f"zs:decision:{key}"

    def get(self, key: str) -> dict[str, Any] | None:
        client = get_redis()
        if client:
            raw = client.get(self._redis_key(key))
            return json.loads(raw) if raw else None

        import time

        entry = self._local.get(key)
        if not entry:
            return None
        expires_at, payload = entry
        if time.time() > expires_at:
            self._local.pop(key, None)
            return None
        return json.loads(payload)

    def set(self, key: str, value: dict[str, Any], ttl_seconds: int | None = None) -> None:
        ttl = ttl_seconds if ttl_seconds is not None else settings.DECISION_CACHE_TTL_SECONDS
        payload = json.dumps(value)
        client = get_redis()
        if client:
            client.setex(self._redis_key(key), ttl, payload)
            return

        import time

        self._local[key] = (time.time() + ttl, payload)

    def invalidate_prefix(self, prefix: str) -> None:
        client = get_redis()
        if client:
            pattern = self._redis_key(f"{prefix}*")
            cursor = 0
            while True:
                cursor, keys = client.scan(cursor=cursor, match=pattern, count=200)
                if keys:
                    client.delete(*keys)
                if cursor == 0:
                    break
            return

        to_delete = [k for k in self._local if k.startswith(prefix)]
        for k in to_delete:
            self._local.pop(k, None)


decision_cache = DecisionCache()
