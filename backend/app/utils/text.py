"""Small text helpers."""

import re


def slugify(value: str) -> str:
    """Turn arbitrary text into a URL-safe slug.

    "Acme Corp Pvt. Ltd." -> "acme-corp-pvt-ltd"
    Returns "" if nothing usable remains (caller should provide a fallback).
    """
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-")
