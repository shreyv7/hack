"""A/B test variant assignment for consent banners (Req 3)."""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

VARIANT_COOKIE = "dpdpa_ab_variant"


def deterministic_bucket(session_id: str, banner_id: str) -> int:
    raw = f"{session_id}:{banner_id}".encode()
    return int(hashlib.sha256(raw).hexdigest(), 16) % 100


def is_test_concluded(banner: Any, now: datetime | None = None) -> bool:
    if not getattr(banner, "ab_test_enabled", False):
        return False
    started_at = getattr(banner, "ab_test_started_at", None)
    if not started_at:
        return False
    now = now or datetime.now(timezone.utc)
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    duration_days = getattr(banner, "ab_test_duration_days", None) or 14
    return now >= started_at + timedelta(days=duration_days)


def assign_ab_variant(
    *,
    session_id: str,
    banner_id: str,
    banner: Any,
    sticky_cookie: str | None,
) -> tuple[str, bool, bool]:
    """Return (variant A|B, is_new_assignment, test_concluded)."""
    if not getattr(banner, "ab_test_enabled", False):
        return "A", False, False

    if is_test_concluded(banner):
        return "A", False, True

    if sticky_cookie in ("A", "B"):
        return sticky_cookie, False, False

    split = getattr(banner, "ab_traffic_split", None)
    if split is None:
        split = 50
    bucket = deterministic_bucket(session_id, banner_id)
    variant = "B" if bucket < split else "A"
    return variant, True, False


def apply_ab_variant_to_config(banner_config: dict[str, Any], banner: Any, variant: str) -> dict[str, Any]:
    config = dict(banner_config)
    config["ab_variant"] = variant
    if variant != "B" or not getattr(banner, "ab_test_enabled", False):
        return config

    overrides = (
        ("theme", "ab_variant_theme"),
        ("display_style", "ab_variant_display_style"),
        ("position", "ab_variant_position"),
        ("template", "ab_variant_template"),
        ("custom_css", "ab_variant_custom_css"),
    )
    for config_key, banner_attr in overrides:
        value = getattr(banner, banner_attr, None)
        if value:
            config[config_key] = value
    return config


def resolve_session_id(request: Any, fallback_seed: str) -> str:
    cookie = request.cookies.get("dpdpa_session_id")
    if cookie:
        return cookie
    return hashlib.sha256(fallback_seed.encode()).hexdigest()[:32]
