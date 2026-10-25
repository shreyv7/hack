"""DPDPA compliance map — statute catalog with live evidence counts."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from app.models.ropa import ProcessingActivity

from app.models.compliance import DpdpaFeatureMapping, DpdpaStatuteSection, SecurityControl, SecurityControlStatus
from app.models.consent import ConsentNotice, ConsentNoticeVersion
from app.models.consent_receipt import ConsentReceipt
from app.models.compliance import AuditLogEntry
from app.models.dsar import DataRightsRequest, VerificationStatus
from app.models.organization_settings import OrganizationSettings
from app.models.user import User
from app.schemas.compliance import (
    ComplianceMapChapter,
    ComplianceMapChapterSection,
    ComplianceMapReviewUpdate,
    ComplianceMapSectionDetail,
    ComplianceMapSummary,
    MappedFeatureRead,
)
from app.schemas.dashboard import (
    ComplianceScoreBreakdownRead,
    ComplianceScoreControlGap,
    ComplianceScoreControlItem,
    ComplianceScoreRead,
    ComplianceScoreSectionRead,
    ComplianceScoreTrendPoint,
    ComplianceScoreTrendRead,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_evidence_service import (
    coverage_percent,
    feature_readiness_status,
    section_coverage_status,
)
from app.core.rbac import Permission
from app.scripts.seed_compliance_map import default_features_for_section

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
    "vendor-risk": "/data/vendors",
    "policy-hub": "/data/policies",
    "retention-policy-manager": "/data/retention",
    "data-masking": "/data/masking",
    "data-anonymisation": "/data/anonymisation",
    # "monitoring-scheduling": "/security/monitoring",  # DISABLED — prototype page
    "multi-language-editor": "/consent/languages",
    "notice-delivery-channels": "/consent/channels",
    "consent-manager-integration": "/integrations/consent-managers",
    "data-rights-portal-public": "/rights/portal",
    "compliance-score": "/compliance/score",
    "compliance-map": "/compliance/map",
    "cookie-tracker-manager": "/scanner/cookies/manager",
    "consent-withdrawal-flow": "/consent/withdrawal",
    "regulatory-proceedings": "/governance/advanced/regulatory-proceedings",
    "legitimate-use-registry": "/governance/advanced/legitimate-use",
    "grievance-operations": "/rights/grievances",
    "nomination-operations": "/rights/nominations",
}


def _route_to_path(route: str) -> str:
    if not route:
        return "/compliance/map"
    if route.startswith("/"):
        return route
    return PAGE_ROUTE_PATHS.get(route, "/compliance/map")


def _score_status_label(score: int) -> str:
    if score >= 80:
        return "Good Standing"
    if score >= 60:
        return "Needs Attention"
    return "At Risk"


def _section_status(score: int) -> str:
    if score >= 80:
        return "compliant"
    if score >= 60:
        return "minor"
    return "risk"


CONSENT_SECTION_KEYS = frozenset({"2-4", "2-5", "2-6", "2-7"})


class ComplianceMapService(ComplianceBaseService):
    def _documented_controls_count(self, org_id: UUID, *, as_of: datetime | None = None) -> int:
        q = self.db.query(func.count(SecurityControl.id)).filter(
            SecurityControl.organization_id == org_id,
            SecurityControl.status == SecurityControlStatus.documented,
        )
        if as_of is not None:
            q = q.filter(SecurityControl.updated_at <= as_of)
        return q.scalar() or 0

    def _ropa_deductions(self, org_id: UUID, *, as_of: datetime | None = None) -> int:
        deductions = 0
        try:
            q = (
                self.db.query(ProcessingActivity)
                .filter(
                    ProcessingActivity.organization_id == org_id,
                    ProcessingActivity.status == "published",
                    ProcessingActivity.is_deleted == False,
                )
                .options(
                    joinedload(ProcessingActivity.data_categories),
                    joinedload(ProcessingActivity.lawful_bases),
                    joinedload(ProcessingActivity.dpia_links),
                )
            )
            if as_of is not None:
                q = q.filter(ProcessingActivity.updated_at <= as_of)
            for act in q.all():
                has_special = any(c.is_special for c in act.data_categories)
                if has_special and len(act.dpia_links) == 0:
                    deductions += 10
                if len(act.lawful_bases) == 0:
                    deductions += 5
        except Exception:
            self.db.rollback()
            return 0
        return deductions

    def _legitimate_use_deductions(self, org_id: UUID) -> int:
        deductions = 0
        try:
            from app.models.legitimate_use import LegitimateUseRecord, LegitimateUseStatus
            from app.models.consent import Purpose, PurposeVersion, LegalBasis
            registry_count = (
                self.db.query(LegitimateUseRecord)
                .filter(
                    LegitimateUseRecord.organization_id == org_id,
                    LegitimateUseRecord.status == LegitimateUseStatus.active,
                )
                .count()
            )
            if registry_count == 0:
                deductions += 5
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
            for p in purposes:
                if not p.lia_summary or not p.lia_summary.strip():
                    deductions += 3
                if p.is_special_category:
                    deductions += 10
        except Exception:
            self.db.rollback()
            return 0
        return min(25, deductions)

    def _ropa_lia_deductions(self, org_id: UUID) -> int:
        deductions = 0
        try:
            from app.models.ropa import ProcessingActivity, ActivityLawfulBasis
            gaps = (
                self.db.query(ProcessingActivity)
                .join(ActivityLawfulBasis, ActivityLawfulBasis.activity_id == ProcessingActivity.id)
                .filter(
                    ProcessingActivity.organization_id == org_id,
                    ProcessingActivity.status != "archived",
                    ActivityLawfulBasis.basis_type.ilike("%legitimate%"),
                    ActivityLawfulBasis.lia_documented == False,
                )
                .count()
            )
            deductions += gaps * 2
        except Exception:
            self.db.rollback()
            return 0
        return deductions

    def _overall_score_from_sections(self, sections: list[ComplianceScoreSectionRead]) -> int:
        if not sections:
            return 0
        weighted = 0.0
        weight = 0.0
        for section in sections:
            w = float(section.penalty_crores or 1)
            weighted += section.score * w
            weight += w
        return int(round(weighted / weight)) if weight else 0

    def _penalty_from_breakdown(self, breakdown: ComplianceScoreBreakdownRead) -> tuple[int, int]:
        worst = 0
        residual = 0.0
        for section in breakdown.sections:
            if section.penalty_crores:
                worst += section.penalty_crores
                residual += section.penalty_crores * (100 - section.score) / 100
        mitigated = int(round(worst - residual)) if worst else 0
        return mitigated, worst

    def _compliance_score_at(self, org_id: UUID, as_of: datetime) -> int:
        breakdown = self._build_score_breakdown(org_id, as_of=as_of)
        score = self._overall_score_from_sections(breakdown.sections)
        deductions = (
            self._ropa_deductions(org_id, as_of=as_of)
            + self._legitimate_use_deductions(org_id)
            + self._ropa_lia_deductions(org_id)
        )
        return max(0, score - deductions)

    def _score_delta_week(self, user: User, org_id: UUID) -> int | None:
        now = datetime.now(timezone.utc)
        current = self.get_summary(user, org_id=org_id).compliance_score
        past = self._compliance_score_at(org_id, now - timedelta(days=7))
        delta = current - past
        return delta if delta != 0 else None

    def _penalty_exposure(self, user: User, org_id: UUID) -> tuple[int, int]:
        breakdown = self.get_score_breakdown(user, org_id=org_id)
        return self._penalty_from_breakdown(breakdown)

    def _trend_annotation_for_day(self, org_id: UUID, day: datetime) -> str | None:
        start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        entry = (
            self.db.query(AuditLogEntry)
            .filter(
                AuditLogEntry.organization_id == org_id,
                AuditLogEntry.occurred_at >= start,
                AuditLogEntry.occurred_at < end,
            )
            .order_by(AuditLogEntry.occurred_at.desc())
            .first()
        )
        if entry and entry.action:
            return entry.action[:100]
        return None

    def _evidence_for_route(
        self, org_id: UUID, route: str, *, as_of: datetime | None = None
    ) -> tuple[int, datetime | None]:
        now = datetime.now(timezone.utc)
        if route == "consent-notices-manager":
            q = (
                self.db.query(func.count(ConsentNoticeVersion.id))
                .join(ConsentNotice, ConsentNotice.id == ConsentNoticeVersion.notice_id)
                .filter(ConsentNotice.organization_id == org_id)
            )
            if as_of is not None:
                q = q.filter(ConsentNoticeVersion.created_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "proof-vault":
            q = self.db.query(func.count(ConsentReceipt.id)).filter(
                ConsentReceipt.organization_id == org_id
            )
            if as_of is not None:
                q = q.filter(ConsentReceipt.created_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "audit-log":
            q = self.db.query(func.count(AuditLogEntry.id)).filter(
                AuditLogEntry.organization_id == org_id
            )
            if as_of is not None:
                q = q.filter(AuditLogEntry.occurred_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "dsar-sla-tracker":
            q = self.db.query(func.count(DataRightsRequest.id)).filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.verification_status == VerificationStatus.verified,
            )
            if as_of is not None:
                q = q.filter(DataRightsRequest.received_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "security-safeguards-hub":
            q = self.db.query(func.count(SecurityControl.id)).filter(
                SecurityControl.organization_id == org_id,
                SecurityControl.status == SecurityControlStatus.documented,
            )
            if as_of is not None:
                q = q.filter(SecurityControl.updated_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "data-anonymisation":
            from app.models.anonymisation import AnonymisationJob, JobStatus
            from app.models.anonymisation_download_log import AnonymisationDownloadLog

            q_jobs = self.db.query(func.count(AnonymisationJob.id)).filter(
                AnonymisationJob.organization_id == org_id,
                AnonymisationJob.status == JobStatus.completed,
            )
            if as_of is not None:
                q_jobs = q_jobs.filter(AnonymisationJob.finished_at <= as_of)
            job_count = q_jobs.scalar() or 0
            q_dl = self.db.query(func.count(AnonymisationDownloadLog.id)).filter(
                AnonymisationDownloadLog.organization_id == org_id,
            )
            if as_of is not None:
                q_dl = q_dl.filter(AnonymisationDownloadLog.created_at <= as_of)
            dl_count = q_dl.scalar() or 0
            return job_count + dl_count, now
        if route == "data-masking":
            from app.models.masking_run import MaskingRun

            q = self.db.query(func.count(MaskingRun.id)).filter(
                MaskingRun.organization_id == org_id,
            )
            if as_of is not None:
                q = q.filter(MaskingRun.created_at <= as_of)
            count = q.scalar() or 0
            return count, now
        if route == "legitimate-use-registry":
            from app.models.legitimate_use import LegitimateUseRecord

            q = self.db.query(func.count(LegitimateUseRecord.id)).filter(
                LegitimateUseRecord.organization_id == org_id,
            )
            if as_of is not None:
                q = q.filter(LegitimateUseRecord.created_at <= as_of)
            return q.scalar() or 0, now
        if route == "notice-delivery-channels":
            from app.models.notice_delivery import NoticeCampaign

            q = self.db.query(func.count(NoticeCampaign.id)).filter(
                NoticeCampaign.organization_id == org_id,
            )
            if as_of is not None:
                q = q.filter(NoticeCampaign.created_at <= as_of)
            return q.scalar() or 0, now
        if route == "grievance-operations":
            from app.models.dsar import DataRightType

            q = self.db.query(func.count(DataRightsRequest.id)).filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.right_type == DataRightType.grievance,
            )
            if as_of is not None:
                q = q.filter(DataRightsRequest.received_at <= as_of)
            return q.scalar() or 0, now
        if route == "nomination-operations":
            from app.models.dsar import DataRightType

            q = self.db.query(func.count(DataRightsRequest.id)).filter(
                DataRightsRequest.organization_id == org_id,
                DataRightsRequest.right_type == DataRightType.nomination,
            )
            if as_of is not None:
                q = q.filter(DataRightsRequest.received_at <= as_of)
            return q.scalar() or 0, now
        if route == "regulatory-proceedings":
            from app.models.regulatory_proceeding import RegulatoryProceeding

            q = self.db.query(func.count(RegulatoryProceeding.id)).filter(
                RegulatoryProceeding.organization_id == org_id,
            )
            if as_of is not None:
                q = q.filter(RegulatoryProceeding.created_at <= as_of)
            return q.scalar() or 0, now
        return 0, None

    def get_summary(self, user: User, *, org_id: UUID | None = None) -> ComplianceMapSummary:
        resolved = self._resolve_org_id(user, org_id)
        sections = self.db.query(DpdpaStatuteSection).all()
        total_sections = len(sections)
        breakdown = self.get_score_breakdown(user, org_id=resolved)
        score = self._overall_score_from_sections(breakdown.sections)
        deductions = (
            self._ropa_deductions(resolved)
            + self._legitimate_use_deductions(resolved)
            + self._ropa_lia_deductions(resolved)
        )
        score = max(0, score - deductions)
        penalty_mitigated, penalty_worst = self._penalty_from_breakdown(breakdown)

        sections_in_scope = 0
        covered = 0
        partial = 0
        documented_only = 0
        for row in breakdown.sections:
            sections_in_scope += 1
            status = section_coverage_status(row.score)
            if status == "covered":
                covered += 1
            elif status == "partial":
                partial += 1
            else:
                documented_only += 1

        features_mapped = sum(
            s.feature_count for s in sections if s.feature_count < 900 and s.coverage_status.value != "na"
        )
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == resolved)
            .first()
        )
        return ComplianceMapSummary(
            sections_covered=covered,
            sections_total=total_sections,
            sections_in_scope=sections_in_scope,
            sections_partial=partial,
            sections_documented_only=documented_only,
            coverage_percent=coverage_percent(covered, sections_in_scope),
            features_mapped=features_mapped,
            compliance_score=score,
            penalty_mitigated_crores=penalty_mitigated,
            penalty_worst_crores=penalty_worst,
            last_reviewed_at=settings.dpdpa_map_last_reviewed_at if settings else None,
            last_reviewed_by=settings.dpdpa_map_reviewed_by if settings else None,
        )

    def get_chapters(self, user: User, *, org_id: UUID | None = None) -> list[ComplianceMapChapter]:
        resolved = self._resolve_org_id(user, org_id)
        breakdown = self._build_score_breakdown(resolved)
        score_by_key = {row.section_key: row.score for row in breakdown.sections}
        sections = (
            self.db.query(DpdpaStatuteSection)
            .order_by(DpdpaStatuteSection.sort_order)
            .all()
        )
        chapters: dict[int, ComplianceMapChapter] = {}
        for s in sections:
            if s.chapter not in chapters:
                chapters[s.chapter] = ComplianceMapChapter(
                    number=s.chapter,
                    title=s.chapter_title,
                    sections=[],
                )
            is_na = s.coverage_status.value == "na"
            section_score = score_by_key.get(s.section_key, 0)
            dynamic_status = section_coverage_status(section_score, is_na=is_na)
            chapters[s.chapter].sections.append(
                ComplianceMapChapterSection(
                    number=s.section_number,
                    section_key=s.section_key,
                    title=s.title,
                    feature_count=s.feature_count,
                    status=dynamic_status,
                )
            )
        return [chapters[k] for k in sorted(chapters.keys())]

    def get_section_detail(
        self, user: User, section_key: str, *, org_id: UUID | None = None
    ) -> ComplianceMapSectionDetail:
        resolved = self._resolve_org_id(user, org_id)
        section = (
            self.db.query(DpdpaStatuteSection)
            .filter(DpdpaStatuteSection.section_key == section_key)
            .first()
        )
        if section is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Section not found")
        features = (
            self.db.query(DpdpaFeatureMapping)
            .filter(DpdpaFeatureMapping.section_key == section_key)
            .order_by(DpdpaFeatureMapping.sort_order)
            .all()
        )
        mapped: list[MappedFeatureRead] = []
        if features:
            items = [(f.name, f.route, f.implementation_status) for f in features]
        else:
            items = [(n, r, "partial") for n, r in default_features_for_section(section_key)]
        for name, route, impl_status in items:
            count, verified = self._evidence_for_route(resolved, route)
            readiness = feature_readiness_status(impl_status, route, count)
            mapped.append(
                MappedFeatureRead(
                    name=name,
                    status=readiness,
                    last_verified=verified.date().isoformat() if verified and count > 0 else None,
                    evidence_count=count,
                    route=route,
                )
            )
        penalty = f"₹{section.penalty_crores} Cr per occurrence" if section.penalty_crores else "—"
        return ComplianceMapSectionDetail(
            section_key=section.section_key,
            title=f"Section {section.section_number} — {section.title}",
            statute=section.statute_excerpt or section.statute_reference,
            features=mapped,
            penalty=penalty,
        )

    def update_review(
        self, user: User, body: ComplianceMapReviewUpdate, *, org_id: UUID | None = None
    ) -> ComplianceMapSummary:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == resolved)
            .first()
        )
        if settings is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization settings not found")
        settings.dpdpa_map_last_reviewed_at = datetime.now(timezone.utc)
        settings.dpdpa_map_reviewed_by = body.reviewed_by or user.full_name or user.email
        from app.models.compliance import AuditEventType
        from app.services.audit_events import record_audit_event

        record_audit_event(
            self.db,
            resolved,
            user=user,
            action="Compliance map reviewed",
            details=f"Reviewed by {settings.dpdpa_map_reviewed_by}",
            event_type=AuditEventType.configuration,
            resource_type="compliance_map",
            resource_id=str(resolved),
            commit=False,
        )
        self.db.commit()
        return self.get_summary(user, org_id=resolved)

    def get_crosswalk(
        self, user: User, framework: str, *, org_id: UUID | None = None
    ) -> dict:
        import json
        from pathlib import Path

        resolved = self._resolve_org_id(user, org_id)
        path = Path(__file__).resolve().parent.parent / "data" / "framework_crosswalk.json"
        if not path.exists():
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Crosswalk data not found")
        data = json.loads(path.read_text())
        frameworks = data.get("frameworks", {})
        fw_key = framework.lower().replace("-", "").replace("_", "")
        normalized = {
            "rbi": "rbi",
            "iso27001": "iso27001",
            "iso": "iso27001",
            "nist": "nist",
            "nistcsf": "nist",
        }.get(fw_key, fw_key)
        if normalized not in frameworks:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown framework overlay")

        sections: list[dict] = []
        for section_key, mapping in data.get("mappings", {}).items():
            controls = mapping.get(normalized, [])
            if not controls:
                continue
            try:
                detail = self.get_section_detail(user, section_key, org_id=resolved)
                evidence_count = sum(f.evidence_count for f in detail.features)
                feature_count = len(detail.features)
            except HTTPException:
                evidence_count = 0
                feature_count = 0
            sections.append(
                {
                    "section_key": section_key,
                    "title": mapping.get("title", section_key),
                    "dpdpa_section": mapping.get("dpdpa_section", ""),
                    "controls": controls,
                    "evidence_count": evidence_count,
                    "feature_count": feature_count,
                }
            )
        return {
            "framework": normalized,
            "framework_label": frameworks[normalized].get("label", normalized),
            "primary_framework": data.get("primary_framework", "dpdpa"),
            "sections": sections,
        }

    def get_compliance_score(self, user: User, *, org_id: UUID | None = None) -> ComplianceScoreRead:
        summary = self.get_summary(user, org_id=org_id)
        resolved = self._resolve_org_id(user, org_id)
        from app.models.compliance import BreachIncident

        last_incident = (
            self.db.query(BreachIncident)
            .filter(BreachIncident.organization_id == resolved)
            .order_by(BreachIncident.discovered_at.desc())
            .first()
        )
        days_since = None
        if last_incident:
            days_since = (datetime.now(timezone.utc) - last_incident.discovered_at).days

        return ComplianceScoreRead(
            overall_score=summary.compliance_score,
            status_label=_score_status_label(summary.compliance_score),
            penalty_mitigated_crores=summary.penalty_mitigated_crores,
            penalty_worst_crores=summary.penalty_worst_crores,
            last_calculated_at=summary.last_reviewed_at,
            score_delta_week=self._score_delta_week(user, resolved),
            days_since_incident=days_since,
        )

    def _build_score_breakdown(
        self, org_id: UUID, *, as_of: datetime | None = None
    ) -> ComplianceScoreBreakdownRead:
        sections = (
            self.db.query(DpdpaStatuteSection)
            .order_by(DpdpaStatuteSection.sort_order)
            .all()
        )
        rows: list[ComplianceScoreSectionRead] = []
        for section in sections:
            if section.coverage_status.value == "na":
                continue
            features = (
                self.db.query(DpdpaFeatureMapping)
                .filter(DpdpaFeatureMapping.section_key == section.section_key)
                .order_by(DpdpaFeatureMapping.sort_order)
                .all()
            )
            controls: list[ComplianceScoreControlItem] = []
            gaps: list[ComplianceScoreControlGap] = []
            completed = 0
            if features:
                feature_items = [(f.name, f.route, f.implementation_status) for f in features]
            else:
                feature_items = [
                    (n, r, "partial") for n, r in default_features_for_section(section.section_key)
                ]
            for name, route, impl_status in feature_items:
                count, _ = self._evidence_for_route(org_id, route, as_of=as_of)
                readiness = feature_readiness_status(impl_status, route, count)
                complete = readiness == "evidence_backed"
                if not features:
                    complete = count > 0
                route_path = _route_to_path(route)
                controls.append(
                    ComplianceScoreControlItem(
                        name=name,
                        complete=complete,
                        configure_route=route_path,
                    )
                )
                if complete:
                    completed += 1
                else:
                    gaps.append(
                        ComplianceScoreControlGap(
                            label=name,
                            severity="high" if section.penalty_crores and section.penalty_crores >= 150 else "medium",
                        )
                    )
            total = len(feature_items) or 1
            if not feature_items and section.feature_count > 0:
                completed = 0
                total = section.feature_count
            section_score = int(round(completed / total * 100)) if total else 0
            primary_route = (
                _route_to_path(feature_items[0][1])
                if feature_items
                else f"/compliance/map?section={section.section_key}"
            )
            rows.append(
                ComplianceScoreSectionRead(
                    section_key=section.section_key,
                    title=section.title,
                    statute_reference=f"S.{section.section_number}",
                    score=section_score,
                    status=_section_status(section_score),
                    controls_completed=completed,
                    controls_total=total,
                    penalty_crores=section.penalty_crores,
                    configure_route=primary_route,
                    gaps=gaps,
                    controls=controls,
                    statute_excerpt=section.statute_excerpt,
                )
            )
        return ComplianceScoreBreakdownRead(sections=rows)

    def get_score_breakdown(
        self, user: User, *, org_id: UUID | None = None
    ) -> ComplianceScoreBreakdownRead:
        resolved = self._resolve_org_id(user, org_id)
        return self._build_score_breakdown(resolved)

    def get_score_trend(
        self, user: User, *, org_id: UUID | None = None, days: int = 90
    ) -> ComplianceScoreTrendRead:
        resolved = self._resolve_org_id(user, org_id)
        current = self.get_summary(user, org_id=resolved).compliance_score
        now = datetime.now(timezone.utc)
        num_points = min(12, max(4, days // 7))
        step = max(days // num_points, 1)
        raw: list[tuple[datetime, int]] = []
        for i in range(num_points):
            offset_days = days - i * step
            if offset_days <= 0:
                continue
            dt = now - timedelta(days=offset_days)
            raw.append((dt, self._compliance_score_at(resolved, dt)))
        raw.append((now, current))
        raw.sort(key=lambda item: item[0])

        points: list[ComplianceScoreTrendPoint] = []
        prev_score: int | None = None
        for dt, score in raw:
            annotation = self._trend_annotation_for_day(resolved, dt)
            if annotation is None and prev_score is not None and score != prev_score:
                delta = score - prev_score
                annotation = f"Score {'increased' if delta > 0 else 'decreased'} {abs(delta)} pts"
            points.append(
                ComplianceScoreTrendPoint(
                    date=dt.strftime("%d %b"),
                    score=score,
                    annotation=annotation,
                )
            )
            prev_score = score
        if not points:
            points.append(ComplianceScoreTrendPoint(date=now.strftime("%d %b"), score=current))
        return ComplianceScoreTrendRead(points=points)

    def recalculate_score(
        self, user: User, *, org_id: UUID | None = None
    ) -> ComplianceScoreRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        self.update_review(
            user,
            ComplianceMapReviewUpdate(reviewed_by=user.full_name or user.email),
            org_id=org_id,
        )
        return self.get_compliance_score(user, org_id=org_id)
