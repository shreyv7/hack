"""Shared helpers for masking rule coverage calculations."""

from app.models.masking import MaskingRule, MaskingStrategy

# Sensible default strategy per detected PII category.
DEFAULT_RULES: dict[str, tuple[MaskingStrategy, dict]] = {
    "email": (MaskingStrategy.mask, {}),
    "phone": (MaskingStrategy.mask, {"keep_last": 2}),
    "aadhaar": (MaskingStrategy.hash, {}),
    "pan": (MaskingStrategy.mask, {"keep_last": 0}),
    "financial": (MaskingStrategy.hash, {}),
    "ip_address": (MaskingStrategy.mask, {"keep_last": 0}),
    "*": (MaskingStrategy.mask, {"keep_last": 2}),
}


def category_has_active_rule(
    category: str | None,
    stored_rules: list[MaskingRule],
) -> bool:
    """True when a PII category has an active masking strategy (stored enabled or built-in default)."""
    by_cat = {r.pii_category: r for r in stored_rules}
    cat = category or "*"

    stored = by_cat.get(cat)
    if stored is not None:
        return bool(stored.enabled)

    if cat in DEFAULT_RULES:
        return True

    wildcard = by_cat.get("*")
    if wildcard is not None:
        return bool(wildcard.enabled)

    return "*" in DEFAULT_RULES


def covered_pii_field_count(
    pii_fields: list,
    stored_rules: list[MaskingRule],
) -> int:
    return sum(
        1
        for f in pii_fields
        if category_has_active_rule(getattr(f, "pii_category", None), stored_rules)
    )
