"""Aggregates real workspace data for Vajra AI's context panel & grounding.

Both the UI "Current data access" panel and the prompt context the model sees
are built from the SAME source here, so what the user is told is shared matches
what is actually shared.
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.compliance import BreachIncident, BreachIncidentStatus
from app.models.consent import ConsentNotice, ConsentNoticeVersion, NoticeVersionStatus
from app.models.pii_scan import PiiScanJob
from app.models.user import User
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import ComplianceMapService


def _humanize_since(when: datetime | None) -> str:
    if when is None:
        return "No scans yet"
    now = datetime.now(timezone.utc)
    ref = when if when.tzinfo else when.replace(tzinfo=timezone.utc)
    delta = now - ref
    secs = int(delta.total_seconds())
    if secs < 60:
        return "Last scan: just now"
    if secs < 3600:
        return f"Last scan: {secs // 60}m ago"
    if secs < 86400:
        return f"Last scan: {secs // 3600}h ago"
    return f"Last scan: {secs // 86400}d ago"


class ContextItem:
    """A single 'Current data access' row (id is stable for the UI)."""

    def __init__(self, item_id: str, label: str, value: str):
        self.id = item_id
        self.label = label
        self.value = value


class AiContextService(ComplianceBaseService):
    def _safe(self, fn, default):
        """Run a metric query; degrade gracefully if its table/feature is absent.

        The context panel aggregates across several modules — a single one being
        unavailable (e.g. mid-migration) should never 500 the whole panel.
        """
        try:
            return fn()
        except Exception:  # noqa: BLE001 - best-effort dashboard metric
            self.db.rollback()
            return default

    def get_context(self, user: User, *, org_id: UUID | None = None) -> list[ContextItem]:
        resolved = self._resolve_org_id(user, org_id)

        active_breaches = self._safe(
            lambda: self.db.query(func.count(BreachIncident.id))
            .filter(
                BreachIncident.organization_id == resolved,
                BreachIncident.status != BreachIncidentStatus.closed,
            )
            .scalar()
            or 0,
            0,
        )

        live_notices = self._safe(
            lambda: self.db.query(func.count(func.distinct(ConsentNoticeVersion.notice_id)))
            .join(ConsentNotice, ConsentNotice.id == ConsentNoticeVersion.notice_id)
            .filter(
                ConsentNotice.organization_id == resolved,
                ConsentNoticeVersion.status == NoticeVersionStatus.live,
            )
            .scalar()
            or 0,
            0,
        )

        last_scan_at = self._safe(
            lambda: self.db.query(func.max(PiiScanJob.created_at))
            .filter(PiiScanJob.organization_id == resolved)
            .scalar(),
            None,
        )

        score = self._safe(
            lambda: ComplianceMapService(self.db).get_summary(user, org_id=org_id).compliance_score,
            None,
        )

        legit_use_stats = self._safe(
            lambda: self._get_legitimate_use_stats(resolved),
            (0, 0),
        )

        items = [
            ContextItem("breach_incidents", "Breach Incidents", f"{active_breaches} active"),
            ContextItem("consent_notices", "Consent Notices", f"{live_notices} live"),
            ContextItem("pii_scanner", "PII Scanner Results", _humanize_since(last_scan_at)),
        ]
        total_legit, gaps_legit = legit_use_stats
        if total_legit > 0:
            items.append(
                ContextItem(
                    "legitimate_use_lia",
                    "Legitimate Use LIA Gaps",
                    f"{gaps_legit} of {total_legit} missing LIA",
                )
            )
        if score is not None:
            items.append(ContextItem("compliance_score", "Compliance Score", f"{score}/100"))
        return items

    def _get_legitimate_use_stats(self, org_id: UUID) -> tuple[int, int]:
        from app.models.consent import Purpose, PurposeVersion, LegalBasis
        purposes = (
            self.db.query(PurposeVersion)
            .join(Purpose, Purpose.current_live_version_id == PurposeVersion.id)
            .filter(
                Purpose.organization_id == org_id,
                PurposeVersion.legal_basis == LegalBasis.legitimate_use,
                Purpose.archived_at.is_(None),
            )
            .all()
        )
        total = len(purposes)
        gaps = sum(1 for p in purposes if not p.lia_summary or not p.lia_summary.strip())
        return total, gaps

    def get_context_prompt(self, user: User, *, org_id: UUID | None = None) -> tuple[str, list[str]]:
        """Return (prompt_text, source_labels) for grounding + 'Referenced in chat'."""
        items = self.get_context(user, org_id=org_id)
        prompt = "\n".join(f"- {it.label}: {it.value}" for it in items)
        labels = [it.label for it in items]
        return prompt, labels
