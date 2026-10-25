"""Indian mobile phone normalization and validation (+91 + 10 digits)."""

from __future__ import annotations

import re

PHONE_ERROR = "Phone number must be +91 followed by exactly 10 digits"
STORAGE_PATTERN = re.compile(r"^\+91\d{10}$")


def normalize_india_phone(phone: str) -> str:
    """Normalize input to +91XXXXXXXXXX. Raises ValueError when invalid."""
    raw = phone.strip()
    if not raw:
        raise ValueError(PHONE_ERROR)

    digits = "".join(ch for ch in raw if ch.isdigit())
    local: str | None = None

    if len(digits) == 10:
        local = digits
    elif len(digits) == 12 and digits.startswith("91"):
        local = digits[2:]

    if local is None or len(local) != 10:
        raise ValueError(PHONE_ERROR)

    formatted = f"+91{local}"
    if not STORAGE_PATTERN.fullmatch(formatted):
        raise ValueError(PHONE_ERROR)
    return formatted


def try_normalize_india_phone(phone: str | None) -> str | None:
    if phone is None:
        return None
    stripped = phone.strip()
    if not stripped:
        return None
    return normalize_india_phone(stripped)


def phones_match(stored: str, provided: str) -> bool:
    return normalize_india_phone(stored) == normalize_india_phone(provided)
