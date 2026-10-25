"""
In-memory sliding window rate limiter for public CMP SDK endpoints.
"""

from collections import defaultdict
import time
from fastapi import HTTPException, Request, status


class RateLimiter:
    def __init__(self):
        # Format: {(ip, limit_key): [timestamp1, timestamp2, ...]}
        self._hits: dict[tuple[str, str], list[float]] = defaultdict(list)

    def _get_client_ip(self, request: Request) -> str:
        x_forwarded_for = request.headers.get("x-forwarded-for")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "127.0.0.1"

    def check_rate_limit(self, request: Request, limit_key: str, max_requests: int = 60, window_seconds: int = 60) -> None:
        ip = self._get_client_ip(request)
        now = time.time()
        cutoff = now - window_seconds
        key = (ip, limit_key)

        # Filter out old requests
        self._hits[key] = [t for t in self._hits[key] if t > cutoff]

        if len(self._hits[key]) >= max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({max_requests} requests per {window_seconds}s). Please try again later.",
                headers={"Retry-After": str(window_seconds)},
            )

        self._hits[key].append(now)


# Global singleton instance
rate_limiter = RateLimiter()
