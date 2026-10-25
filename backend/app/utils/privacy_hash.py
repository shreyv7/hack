"""Stable privacy-safe hashing helpers."""

from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone


def pseudonymize_ip(client_ip: str, *, salt: str = "vajra") -> str:
    """Return a stable daily-rotating SHA-256 pseudonym for an IP address."""
    day = datetime.now(timezone.utc).date().isoformat()
    payload = f"{salt}:{day}:{client_ip.strip()}".encode()
    return hashlib.sha256(payload).hexdigest()
