"""Residency and governance helpers for data sources."""

from __future__ import annotations

from typing import Literal

from app.models.data_processor import DataProcessor
from app.models.data_source import DataSource, DataSourceStatus
from app.models.organization_settings import OrganizationSettings

ResidencyFlag = Literal["approved", "outside_approved_residency", "unknown"]

# Common AWS/GCP/Azure region prefixes mapped to country codes for residency checks.
REGION_COUNTRY_HINTS: dict[str, str] = {
    "ap-south-1": "IND",
    "ap-south-2": "IND",
    "ap-southeast-1": "SGP",
    "ap-southeast-2": "AUS",
    "eu-west-1": "IRL",
    "eu-central-1": "DEU",
    "us-east-1": "USA",
    "us-west-2": "USA",
}


def _normalize_region(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _region_to_country_code(region: str | None) -> str | None:
    if not region:
        return None
    normalized = region.strip().lower()
    if normalized in REGION_COUNTRY_HINTS:
        return REGION_COUNTRY_HINTS[normalized]
    # Direct ISO-like code (e.g. "IND", "USA")
    upper = region.strip().upper()
    if len(upper) == 3 and upper.isalpha():
        return upper
    return None


def region_to_country_code(region: str | None) -> str | None:
    """Public helper — map a cloud region or ISO code to a 3-letter country code."""
    return _region_to_country_code(region)


def _allowed_region_tokens(settings: OrganizationSettings | None) -> set[str]:
    if settings is None:
        return set()
    tokens: set[str] = set()
    for bucket in (settings.allowed_regions or [], settings.data_residency or []):
        for item in bucket:
            if not isinstance(item, str):
                continue
            tokens.add(_normalize_region(item))
            code = _region_to_country_code(item)
            if code:
                tokens.add(code.lower())
    if settings.primary_region:
        tokens.add(_normalize_region(settings.primary_region))
        code = _region_to_country_code(settings.primary_region)
        if code:
            tokens.add(code.lower())
    return tokens


def compute_residency_flag(
    source: DataSource,
    settings: OrganizationSettings | None,
    processor: DataProcessor | None = None,
) -> ResidencyFlag:
    allowed = _allowed_region_tokens(settings)
    if not allowed:
        return "unknown"

    candidates: list[str] = []
    if source.region:
        candidates.append(_normalize_region(source.region))
        code = _region_to_country_code(source.region)
        if code:
            candidates.append(code.lower())
    if processor:
        if processor.country_code:
            candidates.append(processor.country_code.strip().lower())
        if processor.location:
            candidates.append(_normalize_region(processor.location))
            code = _region_to_country_code(processor.location)
            if code:
                candidates.append(code.lower())

    if not candidates:
        return "unknown"

    for candidate in candidates:
        if candidate in allowed:
            return "approved"
    return "outside_approved_residency"


def needs_retest(source: DataSource, stale_days: int = 30) -> bool:
    if source.status == DataSourceStatus.pending:
        return True
    if source.last_tested_at is None:
        return True
    from datetime import datetime, timezone

    age = datetime.now(timezone.utc) - source.last_tested_at
    return age.days >= stale_days
