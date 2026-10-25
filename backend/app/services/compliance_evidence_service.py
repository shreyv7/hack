"""Evidence-based feature readiness for the DPDPA compliance map."""

from __future__ import annotations

# Routes that exist in the catalog but are not shipped in the product surface.
DISABLED_ROUTES: frozenset[str] = frozenset({"monitoring-scheduling"})

# Feature exists in product but evidence counting is not yet wired for these routes.
CONFIGURED_ONLY_ROUTES: frozenset[str] = frozenset(
    {
        "banner-builder",
        "purpose-registry-new",
        "data-inventory",
        "pii-scanner",
        "ropa-module",
        "dpia-module",
        "breach-disclosure-wizard",
        "childrens-data",
        "ciso-command",
        "vendor-risk",
        "policy-hub",
        "retention-policy-manager",
        "data-masking",
        "multi-language-editor",
        "notice-delivery-channels",
        "consent-manager-integration",
        "data-rights-portal-public",
        "compliance-score",
        "compliance-map",
        "cookie-tracker-manager",
        "consent-withdrawal-flow",
        "deployment-settings",
        "legitimate-use-registry",
        "grievance-operations",
        "nomination-operations",
        "regulatory-proceedings",
    }
)


def feature_readiness_status(
    impl_status: str,
    route: str,
    evidence_count: int,
) -> str:
    """Return feature readiness: not_available | documented_only | configured | evidence_backed."""
    if route in DISABLED_ROUTES:
        return "not_available"
    if evidence_count > 0:
        return "evidence_backed"
    if impl_status in ("partial", "documented", "documented_only", "planned"):
        return "documented_only"
    if impl_status == "implemented" or route in CONFIGURED_ONLY_ROUTES:
        return "configured"
    return "documented_only"


def section_coverage_status(score: int, *, is_na: bool = False) -> str:
    """Map section score to covered | partial | documented_only | na."""
    if is_na:
        return "na"
    if score >= 80:
        return "covered"
    if score >= 40:
        return "partial"
    return "documented_only"


def coverage_percent(sections_covered: int, sections_in_scope: int) -> int:
    if sections_in_scope <= 0:
        return 0
    return int(round(sections_covered / sections_in_scope * 100))
