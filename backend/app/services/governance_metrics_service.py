"""Metrics aggregation adapters — queries source modules, never duplicates data."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import String, cast, or_
from sqlalchemy.orm import Session

from app.models.consent import Purpose
from app.models.consent_banner import ConsentBanner
from app.models.consent_receipt import ConsentReceipt
from app.models.governance_dashboard import WidgetDataSource, WidgetType
from app.models.proof_vault import ProofVaultRecord
from app.models.user import User
from app.schemas.governance_dashboard import MetricsQuery, WidgetMetricsResponse
from app.services.audit_log_service import AuditLogService
from app.services.banner_service import BannerService
from app.services.breach_disclosure_service import BreachDisclosureService
from app.services.ciso_service import CisoService
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import ComplianceMapService
from app.services.dashboard_service import DashboardService
from app.services.data_source_service import DataSourceService
from app.services.dsar_service import DsarService
from app.services.policy_service import PolicyService
from app.services.retention_obligation_service import RetentionObligationService
from app.services.retention_service import RetentionService
from app.services.ropa_service import RopaService
from app.services.security_safeguards_service import SecuritySafeguardsService
from app.services.workspace_service import WorkspaceService

# Widget data sources that filter by business_unit_id when the column exists.
_BU_SCOPED_SOURCES = frozenset({
    WidgetDataSource.rights,
    WidgetDataSource.dpia,
    WidgetDataSource.ropa,
    WidgetDataSource.policy,
    WidgetDataSource.vendor_risk,
    WidgetDataSource.breach,
    WidgetDataSource.proof_vault,
})


class GovernanceMetricsService(ComplianceBaseService):
    def fetch_widget_metrics(
        self, user: User, query: MetricsQuery, *, org_id: UUID | None = None
    ) -> WidgetMetricsResponse:
        resolved_org = self._resolve_org_id(user, org_id)
        adapter = {
            WidgetDataSource.consent: self._consent_metrics,
            WidgetDataSource.proof_vault: self._proof_vault_metrics,
            WidgetDataSource.rights: self._rights_metrics,
            WidgetDataSource.dpia: self._dpia_metrics,
            WidgetDataSource.ropa: self._ropa_metrics,
            WidgetDataSource.policy: self._policy_metrics,
            WidgetDataSource.vendor_risk: self._vendor_risk_metrics,
            WidgetDataSource.security: self._security_metrics,
            WidgetDataSource.breach: self._breach_metrics,
            WidgetDataSource.audit: self._audit_metrics,
            WidgetDataSource.monitoring: self._monitoring_metrics,
            WidgetDataSource.compliance_score: self._compliance_score_metrics,
            WidgetDataSource.module_health: self._module_health_metrics,
            WidgetDataSource.retention: self._retention_metrics,
            WidgetDataSource.data_sources: self._data_source_metrics,
        }[query.data_source]
        data, routes = adapter(user, resolved_org, query)
        bu_id = query.business_unit_id
        data["bu_scoped"] = query.data_source in _BU_SCOPED_SOURCES and bu_id is not None
        data["bu_filter_active"] = bu_id is not None
        if bu_id and not data["bu_scoped"]:
            data["scope_note"] = "Org-wide — this module is not filtered by business unit"
        active_filters = any([
            query.property_id, query.purpose_id, query.channel, query.journey_key,
        ])
        if active_filters:
            data["filters_active"] = True
        return WidgetMetricsResponse(
            data_source=query.data_source,
            widget_type=query.widget_type,
            data=data,
            fetched_at=datetime.now(timezone.utc),
            route_paths=routes,
        )

    @staticmethod
    def _time_cutoff(time_range: str) -> datetime | None:
        days_map = {"7d": 7, "30d": 30, "90d": 90, "180d": 180, "365d": 365, "1y": 365}
        days = days_map.get(time_range)
        if not days:
            return None
        return datetime.now(timezone.utc) - timedelta(days=days)

    def _consent_receipt_query(self, org_id: UUID, query: MetricsQuery):
        q = self.db.query(ConsentReceipt).filter(ConsentReceipt.organization_id == org_id)
        cutoff = self._time_cutoff(query.time_range)
        if cutoff is not None:
            q = q.filter(ConsentReceipt.created_at >= cutoff)
        if query.property_id:
            q = q.filter(ConsentReceipt.property_id == query.property_id)
        if query.channel:
            q = q.filter(ConsentReceipt.capture_channel == query.channel)
        if query.journey_key:
            q = q.filter(ConsentReceipt.journey_key == query.journey_key)
        if query.purpose_id:
            purpose = (
                self.db.query(Purpose)
                .filter(Purpose.id == query.purpose_id, Purpose.organization_id == org_id)
                .first()
            )
            if purpose:
                pid = str(query.purpose_id)
                q = q.filter(
                    or_(
                        ConsentReceipt.consented_purposes.has_key(pid),
                        ConsentReceipt.consented_purposes.has_key(purpose.name),
                        cast(ConsentReceipt.consented_purposes, String).ilike(f"%{purpose.name}%"),
                    )
                )
        return q

    def _org_ab_summary(self, user: User, org_id: UUID) -> dict[str, Any]:
        banners = (
            self.db.query(ConsentBanner)
            .filter(
                ConsentBanner.organization_id == org_id,
                ConsentBanner.ab_test_enabled.is_(True),
                ConsentBanner.archived_at.is_(None),
            )
            .all()
        )
        if not banners:
            return {"enabled": False, "variants": []}

        variant_a_views = variant_b_views = 0
        variant_a_consents = variant_b_consents = 0
        labels: dict[str, str] = {}

        for banner in banners:
            summary = BannerService(self.db).get_ab_summary(user, banner.id, org_id=org_id)
            a = summary.get("assigned_variant_a", 0)
            b = summary.get("assigned_variant_b", 0)
            variant_a_views += a
            variant_b_views += b
            labels["A"] = f"Variant A ({banner.name})"
            labels["B"] = f"Variant B ({banner.name})"
            converted = summary.get("converted_sessions", 0) or summary.get("conversions", 0) or 0
            if b >= a and converted:
                variant_b_consents += converted
            elif converted:
                variant_a_consents += converted

        total_a = max(variant_a_views, 1)
        total_b = max(variant_b_views, 1)
        rate_a = round((variant_a_consents / total_a) * 100) if variant_a_consents else round((variant_a_views / total_a) * 100)
        rate_b = round((variant_b_consents / total_b) * 100) if variant_b_consents else round((variant_b_views / total_b) * 100)

        return {
            "enabled": True,
            "variant_a": {
                "label": labels.get("A", "Variant A (Control)"),
                "rate": rate_a,
                "views": variant_a_views,
                "consents": variant_a_consents,
            },
            "variant_b": {
                "label": labels.get("B", "Variant B (Test)"),
                "rate": rate_b,
                "views": variant_b_views,
                "consents": variant_b_consents,
                "winner": rate_b > rate_a,
            },
        }

    def _consent_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        months = self._months_from_range(query.time_range)
        has_extra_filters = any([query.property_id, query.purpose_id, query.channel, query.journey_key])

        if has_extra_filters:
            receipts = self._consent_receipt_query(org_id, query).all()
            total = len(receipts)
            consented = sum(
                1 for r in receipts
                if isinstance(r.consented_purposes, dict) and any(r.consented_purposes.values())
            )
            consent_rate = f"{round((consented / max(total, 1)) * 100)}%"
            by_channel: dict[str, int] = {}
            for r in receipts:
                ch = r.capture_channel or "unknown"
                by_channel[ch] = by_channel.get(ch, 0) + 1
            trend = [{"month": "filtered", "rate": round((consented / max(total, 1)) * 100)}]
        else:
            trend_data = DashboardService(self.db).get_processing_trend(user, org_id=org_id, months=months)
            summary = DashboardService(self.db).get_summary(user, org_id=org_id)
            consent_card = next((c for c in summary.metric_cards if c.key == "consent_rate"), None)
            consent_rate = consent_card.value if consent_card else "—"
            trend = [{"month": p.month, "rate": round((p.consents / max(p.integration_events, 1)) * 100)} for p in trend_data]
            by_channel = {}

        ab_test = self._org_ab_summary(user, org_id)
        return {
            "consent_rate": consent_rate,
            "trend": trend,
            "by_channel": by_channel,
            "ab_test": ab_test,
            "dpdpa_section": "6",
        }, {"module": "/consent/notices"}

    def _proof_vault_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        bu_id = query.business_unit_id
        q = self.db.query(ProofVaultRecord).filter(ProofVaultRecord.organization_id == org_id)
        if bu_id:
            q = q.filter(ProofVaultRecord.business_unit_id == bu_id)
        cutoff = self._time_cutoff(query.time_range)
        if cutoff is not None:
            q = q.filter(ProofVaultRecord.created_at >= cutoff)
        if query.channel:
            q = q.filter(ProofVaultRecord.channel == query.channel)
        if query.journey_key:
            q = q.filter(ProofVaultRecord.journey_key == query.journey_key)

        count = q.count()
        if count or any([query.channel, query.journey_key, cutoff]):
            return {"total_records": str(count), "label": "Proof Vault"}, {"module": "/proof-vault"}

        summary = DashboardService(self.db).get_summary(user, org_id=org_id)
        vault = next((k for k in summary.sidebar_kpis if k.key == "proof_vault"), None)
        return {"total_records": vault.value if vault else "0", "label": vault.label if vault else "Proof Vault"}, {"module": "/proof-vault"}

    def _rights_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        bu_id = query.business_unit_id
        since = self._time_cutoff(query.time_range)
        dsar = DsarService(self.db).get_dashboard(
            user, org_id=org_id, business_unit_id=bu_id, since=since
        )
        deadlines = DashboardService(self.db).get_deadlines(user, org_id=org_id, limit=query.limit)
        metrics = dsar.metrics
        total = max(metrics.total_active, 1)
        sla_within = round((metrics.on_track / total) * 100)
        return {
            "sla_performance": [
                {"name": "Within SLA", "value": sla_within, "color": "success"},
                {"name": "Exceeded SLA", "value": max(100 - sla_within, 0), "color": "danger"},
            ],
            "open_requests": metrics.total_active,
            "overdue_requests": metrics.breached,
            "ack_overdue": metrics.ack_overdue,
            "deadlines": [d.model_dump() for d in deadlines],
            "dpdpa_section": "11-14",
        }, {"module": "/data-rights/tracker"}

    def _dpia_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        from app.models.dpia import Dpia, DpiaRisk

        bu_id = query.business_unit_id
        base_q = self.db.query(Dpia).filter(Dpia.organization_id == org_id)
        if bu_id:
            base_q = base_q.filter(Dpia.business_unit_id == bu_id)
        cutoff = self._time_cutoff(query.time_range)
        if cutoff is not None:
            base_q = base_q.filter(Dpia.created_at >= cutoff)
        dpias = base_q.all()
        total = len(dpias)
        pending_reviews = sum(1 for d in dpias if d.status == "in_review")
        high_risk = 0
        for dpia in dpias:
            if not dpia.current_version_id:
                continue
            risks = self.db.query(DpiaRisk).filter(DpiaRisk.version_id == dpia.current_version_id).all()
            for risk in risks:
                val = float(risk.residual_score or risk.inherent_score or 0)
                if val >= 30:
                    high_risk += 1
        return {
            "total_assessments": total,
            "pending_reviews": pending_reviews,
            "high_risk_count": high_risk,
            "completion_rate": round((total - pending_reviews) / max(total, 1) * 100),
        }, {"module": "/data/dpia"}

    def _filtered_ropa_kpis(self, user: User, org_id: UUID, query: MetricsQuery):
        activities = RopaService(self.db).list_activities(
            user,
            org_id=org_id,
            purpose_id=query.purpose_id,
            department_id=None,
        )
        if query.channel:
            activities = [
                a for a in activities
                if query.channel in (a.banking_context or {}).get("channels", [])
                or any(s.channel == query.channel for s in a.systems)
            ]
        if query.business_unit_id:
            activities = [a for a in activities if a.business_unit_id == query.business_unit_id]

        banking_enabled = RopaService(self.db)._is_banking_org(org_id)
        without_channel = without_data_source = without_retention_link = 0
        by_channel: dict[str, int] = {}

        for a in activities:
            if a.status == "archived":
                continue
            if banking_enabled:
                ctx = a.banking_context or {}
                has_channel = bool(ctx.get("channels")) or any(s.channel for s in a.systems)
                if not has_channel:
                    without_channel += 1
                if len(a.data_sources) == 0:
                    without_data_source += 1
                if len(a.retention_policies) == 0 or all(
                    rp.retention_policy_id is None for rp in a.retention_policies
                ):
                    without_retention_link += 1
                for ch in ctx.get("channels") or []:
                    by_channel[ch] = by_channel.get(ch, 0) + 1

        total = sum(1 for a in activities if a.status != "archived")
        without_dpia = sum(
            1 for a in activities
            if any(c.is_special for c in a.data_categories)
            and len(a.dpia_links) == 0
            and a.status != "archived"
        )
        high_risk = sum(1 for a in activities if 61 <= a.risk_score <= 80 and a.status != "archived")
        critical = sum(1 for a in activities if a.risk_score >= 81 and a.status != "archived")
        cross_border = sum(1 for a in activities if len(a.cross_border_transfers) > 0 and a.status != "archived")
        from app.services.compliance_map_service import ComplianceMapService
        compliance_pct = ComplianceMapService(self.db).get_summary(user, org_id=org_id).compliance_score

        return {
            "total_activities": total,
            "high_risk_activities": high_risk + critical,
            "cross_border_transfers": cross_border,
            "completion_pct": round((sum(1 for a in activities if a.status == "published") / max(total, 1)) * 100),
            "without_dpia": without_dpia,
            "without_retention": sum(1 for a in activities if len(a.retention_policies) == 0 and a.status != "archived"),
            "banking_enabled": banking_enabled,
            "without_channel": without_channel,
            "without_data_source": without_data_source,
            "without_retention_link": without_retention_link,
            "by_channel": by_channel,
            "compliance_percentage": compliance_pct,
        }

    def _ropa_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        if any([query.purpose_id, query.channel]):
            data = self._filtered_ropa_kpis(user, org_id, query)
            return data, {"module": "/data/ropa"}

        bu_id = query.business_unit_id
        kpis = RopaService(self.db).get_dashboard_kpis(user, org_id=org_id, business_unit_id=bu_id)
        data: dict[str, Any] = {
            "total_activities": kpis.total,
            "high_risk_activities": kpis.high_risk + kpis.critical,
            "cross_border_transfers": kpis.cross_border,
            "completion_pct": kpis.compliance_percentage,
            "without_dpia": kpis.without_dpia,
            "without_retention": kpis.without_retention,
        }
        if kpis.banking_enabled:
            data.update(
                {
                    "banking_enabled": True,
                    "without_channel": kpis.without_channel,
                    "without_data_source": kpis.without_data_source,
                    "without_retention_link": kpis.without_retention_link,
                    "by_channel": kpis.by_channel,
                }
            )
        return data, {"module": "/data/ropa"}

    def _retention_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        summary = RetentionService(self.db).get_summary(user, org_id=org_id)
        obligations = RetentionObligationService(self.db).get_summary(user, org_id=org_id)
        flagged = max(summary.records_flagged, 0)
        deleted = summary.records_deleted_total
        progress_pct = round((deleted / max(flagged + deleted, 1)) * 100) if (flagged + deleted) else 0
        return {
            "active_policies": summary.active_policies,
            "total_policies": summary.total_policies,
            "pending_confirmations": summary.pending_confirmations,
            "records_flagged": summary.records_flagged,
            "records_deleted_total": deleted,
            "obligations_pending": obligations.pending,
            "obligations_due": obligations.due,
            "progress_pct": progress_pct,
            "dpdpa_section": "8(7)",
            "label": "Storage limitation — retention actions",
        }, {"module": "/retention"}

    def _data_source_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        sources = DataSourceService(self.db).list_sources(user, org_id=org_id)
        def _mode(s) -> str:
            raw = s.integration_mode
            return raw.value if hasattr(raw, "value") else str(raw or "")

        discovery = sum(1 for s in sources if _mode(s) == "discovery")
        read_write = sum(1 for s in sources if _mode(s) == "read_write")
        by_category: dict[str, int] = {}
        for s in sources:
            cat = s.category if isinstance(s.category, str) else getattr(s.category, "value", str(s.category))
            by_category[str(cat)] = by_category.get(str(cat), 0) + 1
        return {
            "total_sources": len(sources),
            "discovery_only": discovery,
            "read_write": read_write,
            "by_category": by_category,
            "dpdpa_section": "8(7)",
            "label": "Data source coverage (discovery vs destructive)",
        }, {"module": "/data/sources"}

    def _policy_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        bu_id = query.business_unit_id
        stats = PolicyService(self.db).get_stats(user, org_id=org_id, business_unit_id=bu_id)
        return {
            "total_policies": stats.active_count,
            "published": stats.active_count,
            "pending_acknowledgement": stats.pending_acknowledgements,
            "overdue_reviews": 0,
        }, {"module": "/data/policies"}

    def _vendor_risk_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        bu_id = query.business_unit_id
        processors = WorkspaceService(self.db).list_processors(user, org_id=org_id, business_unit_id=bu_id)
        high_risk = sum(1 for p in processors if (p.risk_level or "").lower() in {"high", "critical"})
        return {
            "total_vendors": len(processors),
            "high_risk_vendors": high_risk,
            "vendors": [
                {"name": p.name, "risk_tier": p.risk_level, "status": p.assessment_status}
                for p in processors[: query.limit]
            ],
        }, {"module": "/data/vendors"}

    def _security_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        summary = SecuritySafeguardsService(self.db).get_summary(user, org_id=org_id)
        heatmap = DashboardService(self.db).get_risk_heatmap(user, org_id=org_id)
        return {
            "controls_total": summary.total_controls,
            "controls_implemented": summary.documented_count,
            "heatmap": [c.model_dump() for c in heatmap],
        }, {"module": "/security/safeguards"}

    def _breach_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        bu_id = query.business_unit_id
        incidents = BreachDisclosureService(self.db).list_incidents(
            user, org_id=org_id, business_unit_id=bu_id
        )
        months = self._months_from_range(query.time_range)
        trend = DashboardService(self.db).get_processing_trend(user, org_id=org_id, months=months)
        severity_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        active = [i for i in incidents if i.status not in {"closed", "resolved"}]
        for inc in active:
            sev = (inc.severity or "medium").lower()
            if sev in severity_counts:
                severity_counts[sev] += 1
        return {
            "active_incidents": severity_counts,
            "trend": [{"month": p.month, "incidents": p.integration_events, "resolved": p.dsar_requests} for p in trend],
            "recent": [
                {
                    "id": inc.incident_ref,
                    "title": (inc.wizard_data or {}).get("title") or inc.incident_ref,
                    "severity": inc.severity,
                    "status": inc.status,
                }
                for inc in incidents[: query.limit]
            ],
        }, {"module": "/security/breach"}

    def _audit_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        page = AuditLogService(self.db).list_events(user, org_id=org_id, page=1, page_size=query.limit)
        return {
            "total_events": page.total,
            "events": [
                {
                    "id": str(e.id),
                    "action": e.action,
                    "actor": e.actor_email,
                    "module": e.event_type,
                    "time": e.occurred_at.isoformat(),
                }
                for e in page.items
            ],
        }, {"module": "/compliance/audit-log"}

    def _monitoring_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        ciso = CisoService(self.db).get_dashboard_summary(user, org_id=org_id)
        overall = ciso.scores.get("overall", 0)
        return {
            "overall_score": overall,
            "open_risks": sum(sum(row) for row in ciso.risk_matrix),
            "controls_coverage": ciso.control_health.get("coverage", 0),
            "remediation_tasks": ciso.mttr_metrics.get("open", 0),
        }, {"module": "/security/monitoring"}

    def _compliance_score_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        summary = DashboardService(self.db).get_summary(user, org_id=org_id)
        score = ComplianceMapService(self.db).get_compliance_score(user, org_id=org_id)
        return {
            "score": summary.compliance_score,
            "status": summary.compliance_status,
            "penalty_mitigated_crores": summary.penalty_mitigated_crores,
            "penalty_worst_crores": summary.penalty_worst_crores,
            "score_delta_week": summary.score_delta_week,
            "trend_direction": "improving" if (summary.score_delta_week or 0) >= 0 else "declining",
            "last_calculated_at": summary.last_calculated_at.isoformat() if summary.last_calculated_at else None,
            "breakdown": score.model_dump() if hasattr(score, "model_dump") else {},
        }, {"module": "/compliance/score"}

    def _module_health_metrics(self, user: User, org_id: UUID, query: MetricsQuery) -> tuple[dict[str, Any], dict[str, str]]:
        items = DashboardService(self.db).get_module_health(user, org_id=org_id)
        return {
            "modules": [
                {"section": i.label, "health": i.score, "status": i.status, "gap_count": i.gap_count, "route_path": i.route_path}
                for i in items
            ]
        }, {"module": "/compliance/map"}

    @staticmethod
    def _months_from_range(time_range: str) -> int:
        mapping = {"7d": 1, "30d": 3, "90d": 6, "180d": 12, "365d": 12, "1y": 12}
        return mapping.get(time_range, 6)
