"""Compact dashboard context snapshot for Governance AI prompts.

Produces a short (~12 line, <800 char) text block derived from existing
module services. Never sends full widget payloads, audit logs, or version
history to the model — only numeric scalars and top-level labels.
"""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.compliance import BreachIncident, BreachIncidentStatus
from app.models.governance_dashboard import GovernanceDashboard
from app.models.organization import Organization
from app.models.user import User
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import ComplianceMapService
from app.services.dashboard_service import DashboardService
from app.services.dsar_service import DsarService
from app.services.org_hierarchy_service import OrgHierarchyService


class GovernanceAiContextBuilder(ComplianceBaseService):
    """Builds a compact context snapshot string for Bedrock prompts."""

    def build(
        self,
        user: User,
        *,
        org_id: UUID,
        dashboard_id: UUID | None = None,
    ) -> str:
        """Return a compact multi-line context string (<800 chars target)."""
        org = self.db.get(Organization, org_id)
        org_name = org.name if org else "Organization"

        dashboard_name = "Compliance Dashboards"
        filters_str = "90d"
        if dashboard_id:
            db_row = self.db.get(GovernanceDashboard, dashboard_id)
            if db_row:
                dashboard_name = db_row.name
                f = db_row.filters_json or {}
                parts = [f.get("time_range", "90d"), "DPDPA"]
                bu_id_raw = f.get("business_unit_id")
                if bu_id_raw:
                    try:
                        bu_name = OrgHierarchyService(self.db).get_business_unit_name(UUID(str(bu_id_raw)))
                        if bu_name:
                            parts.append(bu_name)
                    except (ValueError, TypeError):
                        pass
                elif f.get("business_unit") and f.get("business_unit") not in ("All units", ""):
                    parts.append(str(f["business_unit"]))
                filters_str = ", ".join(parts)

        lines: list[str] = [
            f"Org: {org_name} | Dashboard: {dashboard_name} | Filters: {filters_str}",
        ]

        # Compliance score (graceful degradation)
        try:
            summary = DashboardService(self.db).get_summary(user, org_id=org_id)
            delta = summary.score_delta_week
            delta_str = f"Δ{'+' if (delta or 0) >= 0 else ''}{delta}/wk" if delta is not None else ""
            lines.append(
                f"Score: {summary.compliance_score}% ({summary.compliance_status}"
                + (f", {delta_str}" if delta_str else "")
                + f") | Penalty mitigated: ₹{summary.penalty_mitigated_crores} Cr"
            )
            # Module-level KPIs from metric cards (scalars only)
            for card in summary.metric_cards[:4]:
                lines.append(f"  {card.label}: {card.value}{' (' + card.trend + ')' if card.trend else ''}")
        except Exception:
            lines.append("Score: unavailable")

        # Top compliance gaps
        try:
            breakdown = ComplianceMapService(self.db).get_score_breakdown(user, org_id=org_id)
            gaps = [s.title for s in breakdown.sections if s.status != "complete"][:3]
            if gaps:
                lines.append("Priority gaps: " + ", ".join(gaps))
        except Exception:
            pass

        # DSAR SLA (graceful)
        try:
            bu_id = None
            if dashboard_id:
                db_row = self.db.get(GovernanceDashboard, dashboard_id)
                if db_row and db_row.filters_json:
                    raw = db_row.filters_json.get("business_unit_id")
                    if raw:
                        bu_id = UUID(str(raw))
            dsar = DsarService(self.db).get_dashboard(user, org_id=org_id, business_unit_id=bu_id)
            m = dsar.metrics
            total = max(m.total_active, 1)
            sla_pct = round((m.on_track / total) * 100)
            lines.append(f"DSAR SLA: {sla_pct}% within SLA | Open: {m.total_active} | Breached: {m.breached}")
        except Exception:
            pass

        # Active breaches (simple SQL count — avoids loading full incident objects)
        try:
            bu_id = None
            if dashboard_id:
                db_row = self.db.get(GovernanceDashboard, dashboard_id)
                if db_row and db_row.filters_json:
                    raw = db_row.filters_json.get("business_unit_id")
                    if raw:
                        bu_id = UUID(str(raw))
            breach_q = self.db.query(func.count(BreachIncident.id)).filter(
                BreachIncident.organization_id == org_id,
                BreachIncident.status.notin_([BreachIncidentStatus.closed.value]),
            )
            if bu_id:
                breach_q = breach_q.filter(BreachIncident.business_unit_id == bu_id)
            critical = (
                breach_q.filter(BreachIncident.severity == "critical").scalar()
            ) or 0
            high = (
                breach_q.filter(BreachIncident.severity == "high").scalar()
            ) or 0
            if critical or high:
                lines.append(f"Active incidents: {critical} critical, {high} high")
        except Exception:
            pass

        return "\n".join(lines)
