"""
Lightweight value-level PII detectors (the hybrid approach: regex + checksums,
India-aware). Used by the PII Scanner to confirm the Data Inventory's name-based
guesses against actual sampled data.

Each detector returns (classification, pii_category). Checksums (Aadhaar Verhoeff,
credit-card Luhn) cut false positives from random numbers. Free-text NER (names,
addresses in prose) is intentionally NOT here — that's Presidio's job when we
build Masking/Anonymisation (see docs/MODULE_ROADMAP.md §5.2).
"""

from __future__ import annotations

import re

# --- Verhoeff checksum (Aadhaar) ---
_VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
]
_VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
]


def _verhoeff_valid(digits: str) -> bool:
    c = 0
    for i, item in enumerate(reversed(digits)):
        c = _VERHOEFF_D[c][_VERHOEFF_P[i % 8][int(item)]]
    return c == 0


def _luhn_valid(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")
_PHONE_RE = re.compile(r"^(?:\+?91[\-\s]?)?[6-9]\d{9}$")
_AADHAAR_RE = re.compile(r"^\d{4}\s?\d{4}\s?\d{4}$")
_CARD_RE = re.compile(r"^\d{13,19}$")
_IPV4_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")
# IFSC: 4 letters + '0' + 6 alphanumerics (e.g. SBIN0001234).
_IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z0-9]{6}$")
# UPI handle: local@bankhandle where the handle has NO dot (that's what
# distinguishes it from an email, e.g. priya@oksbi, 9876543210@paytm).
_UPI_RE = re.compile(r"^[A-Za-z0-9.\-_]{2,}@[A-Za-z]{2,}$")

# Human labels for categories (used in UI / findings).
CATEGORY_LABELS: dict[str, str] = {
    "aadhaar": "Aadhaar",
    "pan": "PAN",
    "ifsc": "IFSC Code",
    "upi": "UPI ID",
    "email": "Email Address",
    "phone": "Phone Number",
    "financial": "Card / Financial",
    "ip_address": "IP Address",
    # Free-text (NER) categories — emitted when scanning uploaded documents.
    "person": "Name (Person)",
    "location": "Location / Address",
    "demographic": "Demographic",
}


def detect_value(raw: object) -> tuple[str, str] | None:
    """Return (classification, pii_category) for a single value, or None."""
    if raw is None:
        return None
    value = str(raw).strip()
    if not value or len(value) > 256:
        return None
    digits = re.sub(r"[\s\-]", "", value)

    if _AADHAAR_RE.match(value):
        bare = re.sub(r"\s", "", value)
        if len(bare) == 12 and _verhoeff_valid(bare):
            return ("sensitive", "aadhaar")
    if _PAN_RE.match(value):
        return ("sensitive", "pan")
    if _IFSC_RE.match(value):
        return ("sensitive", "ifsc")
    if _EMAIL_RE.match(value):
        return ("personal", "email")
    if _UPI_RE.match(value):
        return ("sensitive", "upi")
    if _PHONE_RE.match(value) or _PHONE_RE.match(digits):
        return ("personal", "phone")
    if _CARD_RE.match(digits) and _luhn_valid(digits):
        return ("sensitive", "financial")
    if _IPV4_RE.match(value) and all(0 <= int(o) <= 255 for o in value.split(".")):
        return ("personal", "ip_address")
    return None


def mask_value(raw: object, category: str) -> str:
    """Produce a privacy-preserving sample for display in findings."""
    value = str(raw)
    if category == "email" and "@" in value:
        local, _, domain = value.partition("@")
        head = local[0] if local else ""
        return f"{head}{'•' * max(len(local) - 1, 1)}@{domain}"
    if len(value) <= 4:
        return "•" * len(value)
    return f"{value[:2]}{'•' * (len(value) - 4)}{value[-2:]}"
