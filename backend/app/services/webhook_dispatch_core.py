"""Shared outbound webhook transport — HMAC signing, retries, auth headers (Req 7)."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

import httpx

WEBHOOK_TIMEOUT_SECONDS = 10.0
WEBHOOK_MAX_ATTEMPTS = 3
WEBHOOK_BACKOFF_BASE_SECONDS = 2.0
WEBHOOK_BACKOFF_MULTIPLIER = 3.0


def event_subscribed(subscribed_events: list[str] | None, event_type: str) -> bool:
    """Empty/None subscription list means deliver all events."""
    if not subscribed_events:
        return True
    normalized = {e.strip() for e in subscribed_events if e and str(e).strip()}
    if not normalized:
        return True
    return event_type in normalized


def sign_webhook_payload(payload_bytes: bytes, secret: str, timestamp: str) -> str:
    message = f"{timestamp}.".encode("utf-8") + payload_bytes
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def build_webhook_headers(
    *,
    event_type: str,
    payload_bytes: bytes,
    user_agent: str,
    signing_secret: str | None = None,
    bearer_token: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": user_agent,
        "X-Vajra-Event": event_type,
    }
    if signing_secret:
        timestamp = str(int(time.time()))
        headers["X-Vajra-Timestamp"] = timestamp
        headers["X-Vajra-Signature"] = sign_webhook_payload(
            payload_bytes, signing_secret, timestamp
        )
    if bearer_token:
        headers["Authorization"] = f"Bearer {bearer_token}"
    if extra_headers:
        headers.update(extra_headers)
    return headers


def post_webhook_with_retries(
    url: str,
    payload: dict[str, Any],
    *,
    event_type: str,
    user_agent: str = "Vajra-Webhook/1.0",
    signing_secret: str | None = None,
    bearer_token: str | None = None,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """POST JSON payload with exponential backoff retries on failure."""
    payload_bytes = json.dumps(payload, separators=(",", ":"), default=str).encode("utf-8")
    headers = build_webhook_headers(
        event_type=event_type,
        payload_bytes=payload_bytes,
        user_agent=user_agent,
        signing_secret=signing_secret,
        bearer_token=bearer_token,
        extra_headers=extra_headers,
    )

    started = time.perf_counter()
    status_code: int | None = None
    error: str | None = None
    success = False
    attempts = 0

    for attempt in range(WEBHOOK_MAX_ATTEMPTS):
        attempts = attempt + 1
        try:
            with httpx.Client(timeout=WEBHOOK_TIMEOUT_SECONDS, follow_redirects=True) as client:
                response = client.post(url, content=payload_bytes, headers=headers)
            status_code = response.status_code
            success = 200 <= response.status_code < 300
            if success:
                error = None
                break
            error = response.text[:500] or f"HTTP {response.status_code}"
        except httpx.RequestError as exc:
            error = str(exc)
            status_code = None

        if attempt < WEBHOOK_MAX_ATTEMPTS - 1:
            delay = WEBHOOK_BACKOFF_BASE_SECONDS * (WEBHOOK_BACKOFF_MULTIPLIER ** attempt)
            time.sleep(delay)

    latency_ms = int((time.perf_counter() - started) * 1000)
    return {
        "success": success,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "error": error,
        "attempts": attempts,
    }
