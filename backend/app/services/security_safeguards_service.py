"""Security safeguards hub — per-org control registry."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.models.ciso import CisoRisk, CisoRiskStatus
from app.models.compliance import (
    AuditEventType,
    AuditLogEntry,
    AuditSeverity,
    BreachIncident,
    BreachIncidentStatus,
    SecurityControl,
    SecurityControlStatus,
    SecurityCertification,
)
from app.models.data_inventory import DataInventoryAsset, DataInventoryField, FieldClassification
from app.models.organization_settings import OrganizationSettings
from app.models.user import User, UserRole, UserStatus
from app.core.rbac import Permission, has_permission
from app.schemas.compliance import (
    SecurityControlRead,
    SecurityControlUpdate,
    SecurityPostureMetric,
    SecurityPostureRead,
    SecuritySafeguardsRead,
    SecuritySafeguardsSummary,
)
from app.scripts.seed_compliance_map import DEFAULT_SECURITY_CONTROLS
from app.services.audit_log_service import AuditLogService
from app.services.compliance_base import ComplianceBaseService
from app.core.rbac import Permission, has_permission
from app.services.security_safeguards_sync import sync_controls_from_platform

SECTION_8_PENALTY_CRORES = 250


class SecuritySafeguardsService(ComplianceBaseService):
    def _seed_controls(self, org_id: UUID) -> None:
        existing = (
            self.db.query(SecurityControl)
            .filter(SecurityControl.organization_id == org_id)
            .count()
        )
        if existing > 0:
            return
        for row in DEFAULT_SECURITY_CONTROLS:
            self.db.add(
                SecurityControl(
                    organization_id=org_id,
                    control_key=row["control_key"],
                    name=row["name"],
                    status=SecurityControlStatus(row["status"]),
                    checklist_items=row["checklist_items"],
                    items_total=row["items_total"],
                    items_completed=row["items_completed"],
                    evidence_label=row.get("evidence_label"),
                )
            )
        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if settings and settings.third_party_audit_firm:
            self.db.add(
                SecurityCertification(
                    organization_id=org_id,
                    name="Third-party audit",
                    status="active",
                    valid_until=settings.audit_valid_until,
                    auditor_firm=settings.third_party_audit_firm,
                )
            )
        self.db.commit()

    def _control_to_read(self, c: SecurityControl) -> SecurityControlRead:
        return SecurityControlRead(
            id=c.id,
            control_key=c.control_key,
            name=c.name,
            status=c.status.value,
            items_total=c.items_total,
            items_completed=c.items_completed,
            evidence=c.evidence_label,
            checklist_items=c.checklist_items or [],
        )

    @staticmethod
    def _score_label(score: int) -> str:
        if score >= 85:
            return "Strong"
        if score >= 60:
            return "Improving"
        if score >= 30:
            return "At risk"
        return "Critical gap"

    def _compute_summary(self, controls: list[SecurityControl]) -> SecuritySafeguardsSummary:
        documented = sum(1 for c in controls if c.status == SecurityControlStatus.documented)
        partial = sum(1 for c in controls if c.status == SecurityControlStatus.partial)
        missing = sum(1 for c in controls if c.status == SecurityControlStatus.missing)
        total = len(controls) or 1
        item_total = sum(c.items_total for c in controls) or 1
        item_done = sum(c.items_completed for c in controls)
        score = round((item_done / item_total) * 100)
        penalty_worst = SECTION_8_PENALTY_CRORES
        penalty_current = round(penalty_worst * (100 - score) / 100)
        penalty_mitigated = penalty_worst - penalty_current
        return SecuritySafeguardsSummary(
            score=score,
            score_label=self._score_label(score),
            documented_count=documented,
            partial_count=partial,
            missing_count=missing,
            total_controls=total,
            penalty_current_crores=penalty_current,
            penalty_worst_crores=penalty_worst,
            penalty_mitigated_crores=penalty_mitigated,
        )

    def _compute_posture(
        self, org_id: UUID, controls: list[SecurityControl]
    ) -> SecurityPostureRead:
        now = datetime.now(timezone.utc)
        since_24h = now - timedelta(hours=24)
        since_2h = now - timedelta(hours=2)
        since_7d = now - timedelta(days=7)

        failed_logins = (
            self.db.query(func.count(AuditLogEntry.id))
            .filter(
                AuditLogEntry.organization_id == org_id,
                AuditLogEntry.occurred_at >= since_24h,
                or_(
                    AuditLogEntry.action.ilike("%failed login%"),
                    AuditLogEntry.details.ilike("%invalid password%"),
                ),
            )
            .scalar()
            or 0
        )
        if failed_logins == 0:
            failed_metric = SecurityPostureMetric(
                value=failed_logins, status="success", status_label="Normal"
            )
        elif failed_logins <= 20:
            failed_metric = SecurityPostureMetric(
                value=failed_logins, status="normal", status_label="Normal"
            )
        elif failed_logins <= 50:
            failed_metric = SecurityPostureMetric(
                value=failed_logins, status="warning", status_label="Elevated"
            )
        else:
            failed_metric = SecurityPostureMetric(
                value=failed_logins, status="critical", status_label="High volume"
            )

        privileged_sessions = (
            self.db.query(func.count(User.id))
            .filter(
                User.organization_id == org_id,
                User.status == UserStatus.active,
                User.role.in_((UserRole.admin, UserRole.superadmin)),
                User.last_login_at.isnot(None),
                User.last_login_at >= since_2h,
            )
            .scalar()
            or 0
        )
        privileged_metric = SecurityPostureMetric(
            value=privileged_sessions,
            status="normal",
            status_label="Active now" if privileged_sessions else "None active",
        )

        unencrypted_assets = (
            self.db.query(func.count(DataInventoryField.id))
            .join(DataInventoryAsset, DataInventoryField.asset_id == DataInventoryAsset.id)
            .filter(
                DataInventoryAsset.organization_id == org_id,
                DataInventoryField.is_encrypted.is_(False),
                DataInventoryField.classification.in_(
                    (FieldClassification.personal, FieldClassification.sensitive)
                ),
            )
            .scalar()
            or 0
        )
        unencrypted_metric = SecurityPostureMetric(
            value=unencrypted_assets,
            status="success" if unencrypted_assets == 0 else "warning",
            status_label="✓ All secure" if unencrypted_assets == 0 else "Review encryption",
        )

        mfa_control = next((c for c in controls if c.control_key == "access_mfa"), None)
        mfa_documented = (
            mfa_control is not None
            and mfa_control.status == SecurityControlStatus.documented
            and mfa_control.items_completed >= mfa_control.items_total
        )
        privileged_users = (
            self.db.query(func.count(User.id))
            .filter(
                User.organization_id == org_id,
                User.status == UserStatus.active,
                User.role.in_((UserRole.admin, UserRole.superadmin)),
            )
            .scalar()
            or 0
        )
        mfa_bypass = 0 if mfa_documented else privileged_users
        mfa_metric = SecurityPostureMetric(
            value=mfa_bypass,
            status="success" if mfa_bypass == 0 else "warning",
            status_label="✓ 100% enforced" if mfa_bypass == 0 else "MFA control gap",
        )

        open_risks = (
            self.db.query(func.count(CisoRisk.id))
            .filter(
                CisoRisk.organization_id == org_id,
                CisoRisk.status == CisoRiskStatus.open,
            )
            .scalar()
            or 0
        )
        audit_anomalies = (
            self.db.query(func.count(AuditLogEntry.id))
            .filter(
                AuditLogEntry.organization_id == org_id,
                AuditLogEntry.occurred_at >= since_7d,
                AuditLogEntry.severity.in_((AuditSeverity.warning, AuditSeverity.critical)),
                ~AuditLogEntry.action.ilike("%failed login%"),
            )
            .scalar()
            or 0
        )
        open_breaches = (
            self.db.query(func.count(BreachIncident.id))
            .filter(
                BreachIncident.organization_id == org_id,
                BreachIncident.status != BreachIncidentStatus.closed,
            )
            .scalar()
            or 0
        )
        missing_critical_controls = sum(
            1
            for c in controls
            if c.status == SecurityControlStatus.missing
            and c.control_key in ("vuln_mgmt", "incident_response", "logging")
        )
        anomaly_count = (
            open_risks + audit_anomalies + open_breaches + missing_critical_controls
        )
        if anomaly_count == 0:
            anomaly_metric = SecurityPostureMetric(
                value=0, status="success", status_label="None detected"
            )
        else:
            anomaly_metric = SecurityPostureMetric(
                value=anomaly_count, status="warning", status_label="Investigate"
            )

        return SecurityPostureRead(
            failed_logins_24h=failed_metric,
            privileged_sessions=privileged_metric,
            unencrypted_assets=unencrypted_metric,
            mfa_bypass_users=mfa_metric,
            anomalies=anomaly_metric,
            computed_at=now,
        )

    def get_safeguards(self, user: User, *, org_id: UUID | None = None) -> SecuritySafeguardsRead:
        resolved = self._resolve_org_id(user, org_id)
        self._seed_controls(resolved)
        AuditLogService(self.db).ensure_initialized(resolved)
        controls = (
            self.db.query(SecurityControl)
            .filter(SecurityControl.organization_id == resolved)
            .order_by(SecurityControl.control_key)
            .all()
        )
        sync_controls_from_platform(self.db, resolved, controls)
        certs = (
            self.db.query(SecurityCertification)
            .filter(SecurityCertification.organization_id == resolved)
            .all()
        )
        return SecuritySafeguardsRead(
            controls=[self._control_to_read(c) for c in controls],
            certifications=[
                {
                    "name": cert.name,
                    "status": cert.status,
                    "valid_until": cert.valid_until,
                    "auditor_firm": cert.auditor_firm,
                }
                for cert in certs
            ],
            summary=self._compute_summary(controls),
            posture=self._compute_posture(resolved, controls),
        )

    def get_summary(self, user: User, *, org_id: UUID | None = None) -> SecuritySafeguardsSummary:
        data = self.get_safeguards(user, org_id=org_id)
        return data.summary

    def update_control(
        self,
        user: User,
        control_id: UUID,
        body: SecurityControlUpdate,
        *,
        org_id: UUID | None = None,
    ) -> SecurityControlRead:
        if not has_permission(user, Permission.SECURITY_WRITE) and not has_permission(
            user, Permission.SECURITY_POLICY_OVERRIDE
        ):
            self._require_admin(user)
        resolved = self._resolve_org_id(user, org_id)
        control = (
            self.db.query(SecurityControl)
            .filter(SecurityControl.organization_id == resolved, SecurityControl.id == control_id)
            .first()
        )
        if control is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Control not found")
        if body.status is not None:
            control.status = SecurityControlStatus(body.status)
        if body.items_completed is not None:
            control.items_completed = body.items_completed
        if body.evidence_label is not None:
            control.evidence_label = body.evidence_label
        control.updated_by_user_id = user.id
        audit = AuditLogService(self.db)
        audit.record_event(
            resolved,
            user=user,
            action=f"Security control updated: {control.name}",
            details=f"Status: {control.status.value}, evidence: {control.evidence_label or '—'}",
            event_type=AuditEventType.configuration,
            resource_type="security_control",
            resource_id=str(control.id),
        )
        self.db.commit()
        self.db.refresh(control)
        return self._control_to_read(control)
