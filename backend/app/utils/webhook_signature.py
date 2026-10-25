"""Webhook HMAC signature verification."""

from __future__ import annotations

import hashlib
import hmac
import time


def compute_webhook_signature(secret: str, body: bytes, timestamp: str) -> str:
    signed_payload = f"{timestamp}.".encode() + body
    digest = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def verify_webhook_signature(
    secret: str,
    body: bytes,
    signature_header: str | None,
    timestamp_header: str | None,
    *,
    max_skew_seconds: int = 300,
) -> None:
    if not secret:
        raise ValueError("Webhook secret is not configured")
    if not signature_header or not timestamp_header:
        raise ValueError("Missing webhook signature headers")
    try:
        ts = int(timestamp_header)
    except ValueError as exc:
        raise ValueError("Invalid webhook timestamp") from exc
    if abs(int(time.time()) - ts) > max_skew_seconds:
        raise ValueError("Webhook timestamp outside allowed skew window")
    expected = compute_webhook_signature(secret, body, timestamp_header)
    if not hmac.compare_digest(expected, signature_header.strip()):
        raise ValueError("Invalid webhook signature")
