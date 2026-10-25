"""DPDPA 2023 — statutory SLA defaults and per-org overrides.

Anchors:
- Section 11: Right to access personal data
- Section 12: Right to correction and erasure
- Section 13: Right to grievance (acknowledge promptly; resolve within prescribed period)
- Section 14: Right to nominate a representative

Timelines below follow DPDPA Rules / industry practice defaults and can be overridden
per organization via organization_settings.dsar_sla_config (JSON).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from app.models.dsar import DataRightType
from app.models.organization_settings import OrganizationSettings

# Statutory / Rules-aligned defaults (days unless noted)
DEFAULT_ACCESS_DAYS = 30
DEFAULT_CORRECTION_DAYS = 30
DEFAULT_ERASURE_DAYS = 30
DEFAULT_NOMINATION_DAYS = 30
DEFAULT_GRIEVANCE_RESOLVE_DAYS = 30
DEFAULT_GRIEVANCE_ACK_HOURS = 24
DEFAULT_WITHDRAW_CONSENT_HOURS = 24
DEFAULT_MASKING_DAYS = 30
DEFAULT_ANONYMIZATION_DAYS = 30


@dataclass(frozen=True)
class DsarSlaConfig:
    access_days: int = DEFAULT_ACCESS_DAYS
    correction_days: int = DEFAULT_CORRECTION_DAYS
    erasure_days: int = DEFAULT_ERASURE_DAYS
    nomination_days: int = DEFAULT_NOMINATION_DAYS
    grievance_resolve_days: int = DEFAULT_GRIEVANCE_RESOLVE_DAYS
    grievance_ack_hours: int = DEFAULT_GRIEVANCE_ACK_HOURS
    withdraw_consent_hours: int = DEFAULT_WITHDRAW_CONSENT_HOURS
    masking_days: int = DEFAULT_MASKING_DAYS
    anonymization_days: int = DEFAULT_ANONYMIZATION_DAYS

    def resolve_days(self, right_type: DataRightType) -> int:
        mapping = {
            DataRightType.access: self.access_days,
            DataRightType.correction: self.correction_days,
            DataRightType.erasure: self.erasure_days,
            DataRightType.nomination: self.nomination_days,
            DataRightType.grievance: self.grievance_resolve_days,
            DataRightType.masking: self.masking_days,
            DataRightType.anonymization: self.anonymization_days,
        }
        return mapping.get(right_type, DEFAULT_ACCESS_DAYS)

    def response_due_at(self, right_type: DataRightType, received_at: datetime) -> datetime:
        if right_type == DataRightType.withdraw_consent:
            return received_at + timedelta(hours=self.withdraw_consent_hours)
        return received_at + timedelta(days=self.resolve_days(right_type))

    def grievance_ack_due_at(self, received_at: datetime) -> datetime:
        return received_at + timedelta(hours=self.grievance_ack_hours)


def _coerce_int(value: Any, default: int) -> int:
    try:
        parsed = int(value)
        return parsed if parsed > 0 else default
    except (TypeError, ValueError):
        return default


def load_dsar_sla_config(settings_row: OrganizationSettings | None) -> DsarSlaConfig:
    if settings_row is None or not settings_row.dsar_sla_config:
        return DsarSlaConfig()
    raw = settings_row.dsar_sla_config
    if not isinstance(raw, dict):
        return DsarSlaConfig()
    return DsarSlaConfig(
        access_days=_coerce_int(raw.get("access_days"), DEFAULT_ACCESS_DAYS),
        correction_days=_coerce_int(raw.get("correction_days"), DEFAULT_CORRECTION_DAYS),
        erasure_days=_coerce_int(raw.get("erasure_days"), DEFAULT_ERASURE_DAYS),
        nomination_days=_coerce_int(raw.get("nomination_days"), DEFAULT_NOMINATION_DAYS),
        grievance_resolve_days=_coerce_int(
            raw.get("grievance_resolve_days"), DEFAULT_GRIEVANCE_RESOLVE_DAYS
        ),
        grievance_ack_hours=_coerce_int(
            raw.get("grievance_ack_hours"), DEFAULT_GRIEVANCE_ACK_HOURS
        ),
        withdraw_consent_hours=_coerce_int(
            raw.get("withdraw_consent_hours"), DEFAULT_WITHDRAW_CONSENT_HOURS
        ),
        masking_days=_coerce_int(raw.get("masking_days"), DEFAULT_MASKING_DAYS),
        anonymization_days=_coerce_int(raw.get("anonymization_days"), DEFAULT_ANONYMIZATION_DAYS),
    )


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
