"""Overview dashboard aggregation — composes existing module services."""

from __future__ import annotations

from calendar import month_abbr
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.compliance import (
    BreachIncident,
    BreachIncidentStatus,
    DpdpaFeatureMapping,
    DpdpaStatuteSection,
    SectionCoverageStatus,
    SecurityControl,
    SecurityControlStatus,
)
from app.models.consent_receipt import ConsentReceipt
from app.models.dsar import DataRightsActivityEvent, DataRightsRequest, DataRightsRequestStatus
from app.models.integration_event import IntegrationEvent
from app.models.integration_property import IntegrationProperty
from app.models.organization import Organization
from app.models.ropa import ActivityRecipient, ProcessingActivity
from app.schemas.dashboard import (
    ActivityFeedItem,
    AutomationCoverageChapterSummary,
    AutomationCoverageRead,
    AutomationCoverageSectionRow,
    DashboardMetricCard,
    DashboardSidebarKpi,
    DashboardSummaryRead,
    DeadlineItem,
    ModuleHealthItem,
    OnboardingAlertItem,
    OnboardingStatusRead,
    ProcessingTrendPoint,
    RiskHeatmapCell,
)
from app.services.audit_log_service import AuditLogService
from app.services.breach_disclosure_service import BreachDisclosureService
from app.services.ciso_service import CisoService
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import CONSENT_SECTION_KEYS, ComplianceMapService
from app.services.dsar_service import DsarService
from app.services.pii_scan_service import PiiScanService
from app.services.security_safeguards_service import SecuritySafeguardsService
from app.services.workspace_service import WorkspaceService
from app.models.user import User

PAGE_ROUTE_PATHS: dict[str, str] = {
    "consent-notices-manager": "/consent/notices",
    "proof-vault": "/consent/proof-vault",
    "audit-log": "/audit/log",
    "dsar-sla-tracker": "/rights/tracker",
    "security-safeguards-hub": "/security/safeguards",
    "banner-builder": "/consent/banner",
    "purpose-registry-new": "/consent/purposes",
    "data-inventory": "/data/inventory",
    "pii-scanner": "/scanner/pii",
    "ropa-module": "/data/ropa",
    "dpia-module": "/data/dpia",
    "breach-disclosure-wizard": "/breach",
    "childrens-data": "/data/children",
    "ciso-command": "/security/ciso",
}


def route_to_path(route: str) -> str:
    if not route:
        return "/dashboard"
    if route.startswith("/"):
        return route
    return PAGE_ROUTE_PATHS.get(route, f"/compliance/map")


def score_status_label(score: int) -> str:
    if score >= 80:
        return "Good Standing"
    if score >= 60:
        return "Needs Attention"
    return "At Risk"


class DashboardService(ComplianceBaseService):
    def get_summary(self, user: User, *, org_id: UUID | None = None) -> DashboardSummaryRead:
        resolved = self._resolve_org_id(user, org_id)
        org = self.db.get(Organization, resolved)
        map_svc = ComplianceMapService(self.db)
        map_summary = map_svc.get_summary(user, org_id=resolved)
        dsar = DsarService(self.db).get_dashboard(user, org_id=resolved)
        pii = PiiScanService(self.db).get_summary(user, org_id=resolved)
        breaches = BreachDisclosureService(self.db).list_incidents(user, org_id=resolved)
        active_breaches = [b for b in breaches if b.status != BreachIncidentStatus.closed.value]

        consent_count = (
            self.db.query(func.count(ConsentReceipt.id))
            .filter(ConsentReceipt.organization_id == resolved)
            .scalar()
        ) or 0

        consent_trend, consent_trend_dir = self._consent_month_trend(resolved)

        open_findings = pii.sensitive_findings or pii.total_findings

        avg_response = None
        for row in dsar.matrix:
            if row.avg_response_days is not None:
                avg_response = row.avg_response_days
                break

        processor_count = (
            self.db.query(func.count(ActivityRecipient.id))
            .join(ProcessingActivity, ProcessingActivity.id == ActivityRecipient.activity_id)
            .filter(
                ProcessingActivity.organization_id == resolved,
                ProcessingActivity.is_deleted.is_(False),
            )
            .scalar()
        ) or 0

        withdrawal_rate = self._withdrawal_rate(resolved)

        return DashboardSummaryRead(
            organization_id=resolved,
            organization_name=org.name if org else "Organization",
            compliance_score=map_summary.compliance_score,
            compliance_status=score_status_label(map_summary.compliance_score),
            penalty_mitigated_crores=map_summary.penalty_mitigated_crores,
            penalty_worst_crores=map_summary.penalty_worst_crores,
            score_delta_week=map_svc._score_delta_week(user, resolved),
            last_calculated_at=map_summary.last_reviewed_at or datetime.now(timezone.utc),
            metric_cards=[
                DashboardMetricCard(
                    key="consents",
                    label="Consent Records",
                    value=f"{consent_count:,}",
                    trend=consent_trend,
                    trend_direction=consent_trend_dir,
                    route_path="/consent/proof-vault",
                ),
                DashboardMetricCard(
                    key="pii",
                    label="PII Findings",
                    value=str(open_findings),
                    trend=None,
                    trend_direction="neutral",
                    route_path="/scanner/pii",
                ),
                DashboardMetricCard(
                    key="dsar",
                    label="Open DSARs",
                    value=str(dsar.metrics.total_active),
                    trend=f"{dsar.metrics.due_24h} due in 24h" if dsar.metrics.due_24h else None,
                    trend_direction="down" if dsar.metrics.breached else "neutral",
                    route_path="/rights/tracker",
                ),
                DashboardMetricCard(
                    key="breach",
                    label="Active Incidents",
                    value=str(len(active_breaches)),
                    trend=None,
                    trend_direction="neutral",
                    route_path="/breach",
                ),
            ],
            sidebar_kpis=[
                DashboardSidebarKpi(
                    key="dsar_response",
                    label="Avg DSAR response",
                    value=f"{avg_response} days" if avg_response is not None else "—",
                    route_path="/rights/tracker",
                ),
                DashboardSidebarKpi(
                    key="processors",
                    label="Data processors",
                    value=str(processor_count),
                    route_path="/data/ropa",
                ),
                DashboardSidebarKpi(
                    key="withdrawal",
                    label="Withdrawal rate",
                    value=f"{withdrawal_rate}%",
                    route_path="/consent/withdrawal",
                ),
            ],
        )

    def _consent_month_trend(self, org_id: UUID) -> tuple[str | None, str]:
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

        this_count = (
            self.db.query(func.count(ConsentReceipt.id))
            .filter(
                ConsentReceipt.organization_id == org_id,
                ConsentReceipt.created_at >= month_start,
            )
            .scalar()
        ) or 0
        last_count = (
            self.db.query(func.count(ConsentReceipt.id))
            .filter(
                ConsentReceipt.organization_id == org_id,
                ConsentReceipt.created_at >= prev_month_start,
                ConsentReceipt.created_at < month_start,
            )
            .scalar()
        ) or 0

        if this_count == 0 and last_count == 0:
            return None, "neutral"
        if last_count == 0:
            return f"{this_count:,} this month", "up" if this_count > 0 else "neutral"
        pct = round((this_count - last_count) / last_count * 100)
        direction = "up" if pct > 0 else "down" if pct < 0 else "neutral"
        return f"{pct:+d}% vs last month", direction

    def _withdrawal_rate(self, org_id: UUID) -> float:
        total = (
            self.db.query(func.count(ConsentReceipt.id))
            .filter(ConsentReceipt.organization_id == org_id)
            .scalar()
        ) or 0
        if total == 0:
            return 0.0
        from app.models.proof_vault import ProofVaultRecord

        withdrawn = (
            self.db.query(func.count(ProofVaultRecord.id))
            .filter(
                ProofVaultRecord.organization_id == org_id,
                ProofVaultRecord.event_type == "consent_withdrawal",
            )
            .scalar()
        ) or 0
        return round(withdrawn / total * 100, 1)

    def get_module_health(self, user: User, *, org_id: UUID | None = None) -> list[ModuleHealthItem]:
        resolved = self._resolve_org_id(user, org_id)
        map_svc = ComplianceMapService(self.db)
        map_summary = map_svc.get_summary(user, org_id=resolved)
        breakdown = map_svc.get_score_breakdown(user, org_id=resolved)
        consent_sections = [s for s in breakdown.sections if s.section_key in CONSENT_SECTION_KEYS]
        if consent_sections:
            consent_score = round(sum(s.score for s in consent_sections) / len(consent_sections))
            consent_gaps = sum(len(s.gaps) for s in consent_sections)
        else:
            consent_score = map_summary.compliance_score
            consent_gaps = 0
        safeguards = SecuritySafeguardsService(self.db).get_summary(user, org_id=resolved)
        dsar = DsarService(self.db).get_dashboard(user, org_id=resolved)
        pii = PiiScanService(self.db).get_summary(user, org_id=resolved)

        dsar_score = 100
        if dsar.metrics.breached:
            dsar_score = max(40, 100 - dsar.metrics.breached * 15)
        elif dsar.metrics.due_24h:
            dsar_score = 75

        open_findings = pii.sensitive_findings or 0
        pii_score = max(30, 100 - open_findings * 5)

        modules = [
            ModuleHealthItem(
                module="consent",
                label="Consent Management",
                score=consent_score,
                status="healthy" if consent_score >= 70 else "warning",
                gap_count=consent_gaps,
                route_path="/consent/notices",
            ),
            ModuleHealthItem(
                module="safeguards",
                label="Security Safeguards",
                score=safeguards.score,
                status="healthy" if safeguards.score >= 70 else "warning",
                gap_count=safeguards.total_controls - safeguards.documented_count,
                route_path="/security/safeguards",
            ),
            ModuleHealthItem(
                module="dsar",
                label="Data Principal Rights",
                score=dsar_score,
                status="healthy" if dsar_score >= 70 else "critical" if dsar.metrics.breached else "warning",
                gap_count=dsar.metrics.breached + dsar.metrics.ack_overdue,
                route_path="/rights/tracker",
            ),
            ModuleHealthItem(
                module="pii",
                label="PII Scanner",
                score=pii_score,
                status="healthy" if pii_score >= 70 else "warning",
                gap_count=open_findings,
                route_path="/scanner/pii",
            ),
        ]
        return modules

    def get_activity_feed(
        self, user: User, *, org_id: UUID | None = None, limit: int = 20
    ) -> list[ActivityFeedItem]:
        resolved = self._resolve_org_id(user, org_id)
        items: list[ActivityFeedItem] = []

        audit = AuditLogService(self.db).list_events(
            user, org_id=resolved, page=1, page_size=limit
        )
        for e in audit.items:
            items.append(
                ActivityFeedItem(
                    id=f"audit-{e.id}",
                    time=e.time,
                    actor=e.actor,
                    action=e.action,
                    module="Audit",
                    deep_link="/audit/log",
                )
            )

        dsar_events = (
            self.db.query(DataRightsActivityEvent)
            .filter(DataRightsActivityEvent.organization_id == resolved)
            .order_by(DataRightsActivityEvent.created_at.desc())
            .limit(limit)
            .all()
        )
        for ev in dsar_events:
            items.append(
                ActivityFeedItem(
                    id=f"dsar-{ev.id}",
                    time=ev.created_at,
                    actor=ev.actor_name or "System",
                    action=ev.message,
                    module="DSAR",
                    deep_link="/rights/logs",
                )
            )

        items.sort(key=lambda x: x.time, reverse=True)
        return items[:limit]

    def get_deadlines(
        self, user: User, *, org_id: UUID | None = None, limit: int = 10
    ) -> list[DeadlineItem]:
        resolved = self._resolve_org_id(user, org_id)
        now = datetime.now(timezone.utc)
        deadlines: list[DeadlineItem] = []

        dsar_requests = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == resolved,
                DataRightsRequest.status.in_(
                    [
                        DataRightsRequestStatus.received,
                        DataRightsRequestStatus.in_review,
                        DataRightsRequestStatus.response_ready,
                    ]
                ),
                DataRightsRequest.due_at.isnot(None),
            )
            .order_by(DataRightsRequest.due_at.asc())
            .limit(limit)
            .all()
        )
        for req in dsar_requests:
            severity = "critical" if req.due_at and req.due_at < now else "warning"
            deadlines.append(
                DeadlineItem(
                    id=str(req.id),
                    title=f"DSAR {req.tracking_id}",
                    due_at=req.due_at,
                    category="DSAR",
                    severity=severity,
                    route_path="/rights/tracker",
                )
            )

        breaches = (
            self.db.query(BreachIncident)
            .filter(
                BreachIncident.organization_id == resolved,
                BreachIncident.status != BreachIncidentStatus.closed,
                BreachIncident.deadline_at.isnot(None),
            )
            .order_by(BreachIncident.deadline_at.asc())
            .limit(limit)
            .all()
        )
        for inc in breaches:
            severity = "critical" if inc.deadline_at < now else "warning"
            deadlines.append(
                DeadlineItem(
                    id=str(inc.id),
                    title=(inc.wizard_data or {}).get("title") or inc.incident_ref,
                    due_at=inc.deadline_at,
                    category="Breach",
                    severity=severity,
                    route_path=f"/breach/{inc.incident_ref}",
                )
            )

        deadlines.sort(key=lambda d: d.due_at)
        return deadlines[:limit]

    def get_processing_trend(
        self, user: User, *, org_id: UUID | None = None, months: int = 6
    ) -> list[ProcessingTrendPoint]:
        resolved = self._resolve_org_id(user, org_id)
        now = datetime.now(timezone.utc)
        points: list[ProcessingTrendPoint] = []

        prop_ids = [
            row[0]
            for row in self.db.query(IntegrationProperty.id)
            .filter(IntegrationProperty.organization_id == resolved)
            .all()
        ]

        for i in range(months - 1, -1, -1):
            start = (now.replace(day=1) - timedelta(days=30 * i)).replace(
                day=1, hour=0, minute=0, second=0, microsecond=0
            )
            if i > 0:
                end = (now.replace(day=1) - timedelta(days=30 * (i - 1))).replace(
                    day=1, hour=0, minute=0, second=0, microsecond=0
                )
            else:
                end = now

            consents = (
                self.db.query(func.count(ConsentReceipt.id))
                .filter(
                    ConsentReceipt.organization_id == resolved,
                    ConsentReceipt.created_at >= start,
                    ConsentReceipt.created_at < end,
                )
                .scalar()
            ) or 0

            dsar_count = (
                self.db.query(func.count(DataRightsRequest.id))
                .filter(
                    DataRightsRequest.organization_id == resolved,
                    DataRightsRequest.received_at >= start,
                    DataRightsRequest.received_at < end,
                )
                .scalar()
            ) or 0

            integration_events = 0
            if prop_ids:
                integration_events = (
                    self.db.query(func.count(IntegrationEvent.id))
                    .filter(
                        IntegrationEvent.property_id.in_(prop_ids),
                        IntegrationEvent.created_at >= start,
                        IntegrationEvent.created_at < end,
                    )
                    .scalar()
                ) or 0

            label = f"{month_abbr[start.month]} {start.year}"
            points.append(
                ProcessingTrendPoint(
                    month=label,
                    consents=consents,
                    dsar_requests=dsar_count,
                    integration_events=integration_events,
                )
            )
        return points

    def get_risk_heatmap(self, user: User, *, org_id: UUID | None = None) -> list[RiskHeatmapCell]:
        resolved = self._resolve_org_id(user, org_id)
        try:
            ciso = CisoService(self.db).get_dashboard_summary(user, org_id=resolved)
            categories = [
                ("Controls", ciso.scores.get("controls", 0)),
                ("Evidence", ciso.scores.get("evidence", 0)),
                ("Risks", ciso.scores.get("risks", 0)),
                ("Policies", ciso.scores.get("policies", 0)),
                ("Vendors", ciso.scores.get("vendors", 0)),
                ("Incidents", ciso.scores.get("incidents", 0)),
            ]
        except Exception:
            map_svc = ComplianceMapService(self.db)
            map_summary = map_svc.get_summary(user, org_id=resolved)
            breakdown = map_svc.get_score_breakdown(user, org_id=resolved)
            by_chapter: dict[str, list[int]] = {
                "Consent": [],
                "Rights": [],
                "Security": [],
                "Breach": [],
                "Data": [],
                "Governance": [],
            }
            for section in breakdown.sections:
                key = section.section_key
                if key.startswith("2-"):
                    if key in {"2-8", "2-9", "2-10"}:
                        by_chapter["Security"].append(section.score)
                    else:
                        by_chapter["Consent"].append(section.score)
                elif key.startswith("3-"):
                    by_chapter["Rights"].append(section.score)
                elif key.startswith("4-"):
                    by_chapter["Data"].append(section.score)
                elif "breach" in section.title.lower():
                    by_chapter["Breach"].append(section.score)
                else:
                    by_chapter["Governance"].append(section.score)

            def avg(scores: list[int]) -> int:
                return round(sum(scores) / len(scores)) if scores else map_summary.compliance_score

            categories = [
                ("Consent", avg(by_chapter["Consent"])),
                ("Rights", avg(by_chapter["Rights"])),
                ("Security", avg(by_chapter["Security"])),
                ("Breach", avg(by_chapter["Breach"])),
                ("Data", avg(by_chapter["Data"])),
                ("Governance", avg(by_chapter["Governance"])),
            ]

        cells: list[RiskHeatmapCell] = []
        for name, score in categories:
            if score >= 80:
                level = "low"
            elif score >= 60:
                level = "medium"
            elif score >= 40:
                level = "high"
            else:
                level = "critical"
            cells.append(
                RiskHeatmapCell(
                    category=name,
                    level=level,
                    score=int(score),
                    route_path="/security/ciso",
                )
            )
        return cells

    def get_onboarding_status(self, user: User, *, org_id: UUID | None = None) -> OnboardingStatusRead:
        resolved = self._resolve_org_id(user, org_id)
        ws = WorkspaceService(self.db).get_workspace(user, org_id=resolved)
        alerts: list[OnboardingAlertItem] = []

        if not ws.organization.name:
            alerts.append(
                OnboardingAlertItem(
                    key="profile",
                    message="Complete workspace profile and DPO contact details.",
                    severity="warning",
                    route_path="/settings/workspace",
                )
            )
        if not ws.primary_industry:
            alerts.append(
                OnboardingAlertItem(
                    key="industry",
                    message="Set industry configuration for compliance benchmarks.",
                    severity="info",
                    route_path="/settings/industry",
                )
            )

        from app.models.child_data import ChildDataRecord

        children_count = (
            self.db.query(func.count(ChildDataRecord.id))
            .filter(ChildDataRecord.organization_id == resolved)
            .scalar()
        ) or 0
        if children_count > 0:
            alerts.append(
                OnboardingAlertItem(
                    key="children",
                    message=f"{children_count} children's data records require guardian consent review (DPDPA Section 9).",
                    severity="warning",
                    route_path="/data/children",
                )
            )

        notice_count = ComplianceMapService(self.db)._evidence_for_route(resolved, "consent-notices-manager")[0]
        if notice_count == 0:
            alerts.append(
                OnboardingAlertItem(
                    key="notice",
                    message="Publish a consent notice to meet Section 5 and Section 6 requirements.",
                    severity="warning",
                    route_path="/consent/notices",
                )
            )

        return OnboardingStatusRead(complete=len(alerts) == 0, alerts=alerts)

    def get_automation_coverage(self, user: User, *, org_id: UUID | None = None) -> AutomationCoverageRead:
        resolved = self._resolve_org_id(user, org_id)
        sections = (
            self.db.query(DpdpaStatuteSection)
            .order_by(DpdpaStatuteSection.sort_order)
            .all()
        )
        features_by_key: dict[str, list[DpdpaFeatureMapping]] = {}
        for f in (
            self.db.query(DpdpaFeatureMapping).order_by(DpdpaFeatureMapping.sort_order).all()
        ):
            features_by_key.setdefault(f.section_key, []).append(f)

        fully = partial = manual = na = 0
        rows: list[AutomationCoverageSectionRow] = []
        chapter_stats: dict[int, AutomationCoverageChapterSummary] = {}

        for s in sections:
            feats = features_by_key.get(s.section_key, [])
            if s.coverage_status == SectionCoverageStatus.na:
                automation_status = "na"
                na += 1
            elif feats and all(f.implementation_status == "implemented" for f in feats):
                automation_status = "fully"
                fully += 1
            elif feats and any(f.implementation_status == "implemented" for f in feats):
                automation_status = "partial"
                partial += 1
            else:
                automation_status = "manual"
                manual += 1

            primary_route = feats[0].route if feats else ""
            rows.append(
                AutomationCoverageSectionRow(
                    section_key=s.section_key,
                    chapter=s.chapter,
                    chapter_title=s.chapter_title,
                    section_number=s.section_number,
                    title=s.title,
                    automation_status=automation_status,
                    feature_count=s.feature_count,
                    route_path=route_to_path(primary_route) if primary_route else "/compliance/map",
                )
            )

            if s.chapter not in chapter_stats:
                chapter_stats[s.chapter] = AutomationCoverageChapterSummary(
                    chapter=s.chapter,
                    title=s.chapter_title,
                    fully_automated=0,
                    partial=0,
                    manual=0,
                    total=0,
                )
            ch = chapter_stats[s.chapter]
            ch.total += 1
            if automation_status == "fully":
                ch.fully_automated += 1
            elif automation_status == "partial":
                ch.partial += 1
            elif automation_status == "manual":
                ch.manual += 1

        total = len(sections) or 1
        applicable = total - na
        coverage_pct = round((fully + partial * 0.5) / applicable * 100) if applicable else 0

        return AutomationCoverageRead(
            coverage_percent=coverage_pct,
            fully_automated=fully,
            partial=partial,
            manual=manual,
            not_applicable=na,
            total_sections=total,
            chapters=[chapter_stats[k] for k in sorted(chapter_stats.keys())],
            sections=rows,
            rationale_counts={
                "fully_automated": fully,
                "partial": partial,
                "manual": manual,
                "not_applicable": na,
            },
        )
