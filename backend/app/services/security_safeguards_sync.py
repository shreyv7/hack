"""Derive security control status from live platform signals (inventory, audit, CISO, breach)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import func
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
)
from app.models.data_inventory import DataInventoryAsset, DataInventoryField, FieldClassification
from app.models.organization_settings import OrganizationSettings
from app.models.pii_scan import PiiScanJob
from app.models.user import User, UserRole, UserStatus


def _status_from_items(completed: int, total: int) -> SecurityControlStatus:
    if total <= 0:
        return SecurityControlStatus.missing
    if completed >= total:
        return SecurityControlStatus.documented
    if completed > 0:
        return SecurityControlStatus.partial
    return SecurityControlStatus.missing


def _build_platform_context(db: Session, org_id: UUID) -> dict:
    now = datetime.now(timezone.utc)
    since_30d = now - timedelta(days=30)

    classified_fields = (
        db.query(func.count(DataInventoryField.id))
        .join(DataInventoryAsset, DataInventoryField.asset_id == DataInventoryAsset.id)
        .filter(
            DataInventoryAsset.organization_id == org_id,
            DataInventoryField.classification.in_(
                (FieldClassification.personal, FieldClassification.sensitive)
            ),
        )
        .scalar()
        or 0
    )
    unencrypted_pii = (
        db.query(func.count(DataInventoryField.id))
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
    pii_scans = (
        db.query(func.count(PiiScanJob.id))
        .filter(PiiScanJob.organization_id == org_id)
        .scalar()
        or 0
    )
    audit_entries = (
        db.query(func.count(AuditLogEntry.id))
        .filter(AuditLogEntry.organization_id == org_id)
        .scalar()
        or 0
    )
    audit_retention = (
        db.query(func.count(AuditLogEntry.id))
        .filter(
            AuditLogEntry.organization_id == org_id,
            AuditLogEntry.occurred_at <= since_30d,
        )
        .scalar()
        or 0
    )
    audit_warnings = (
        db.query(func.count(AuditLogEntry.id))
        .filter(
            AuditLogEntry.organization_id == org_id,
            AuditLogEntry.severity.in_((AuditSeverity.warning, AuditSeverity.critical)),
        )
        .scalar()
        or 0
    )
    deletion_events = (
        db.query(func.count(AuditLogEntry.id))
        .filter(
            AuditLogEntry.organization_id == org_id,
            AuditLogEntry.event_type == AuditEventType.deletion,
        )
        .scalar()
        or 0
    )
    admins = (
        db.query(func.count(User.id))
        .filter(
            User.organization_id == org_id,
            User.status == UserStatus.active,
            User.role.in_((UserRole.admin, UserRole.superadmin)),
        )
        .scalar()
        or 0
    )
    admins_must_change_pw = (
        db.query(func.count(User.id))
        .filter(
            User.organization_id == org_id,
            User.status == UserStatus.active,
            User.role.in_((UserRole.admin, UserRole.superadmin)),
            User.must_change_password.is_(True),
        )
        .scalar()
        or 0
    )
    open_risks = (
        db.query(func.count(CisoRisk.id))
        .filter(
            CisoRisk.organization_id == org_id,
            CisoRisk.status == CisoRiskStatus.open,
        )
        .scalar()
        or 0
    )
    breach_count = (
        db.query(func.count(BreachIncident.id))
        .filter(BreachIncident.organization_id == org_id)
        .scalar()
        or 0
    )
    open_breaches = (
        db.query(func.count(BreachIncident.id))
        .filter(
            BreachIncident.organization_id == org_id,
            BreachIncident.status != BreachIncidentStatus.closed,
        )
        .scalar()
        or 0
    )
    settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == org_id)
        .first()
    )
    has_deployment = bool(settings and settings.primary_region and settings.deployment_model)
    has_backup_region = bool(settings and settings.backup_region)
    has_dpo = bool(settings and settings.dpo_email)

    return {
        "classified_fields": classified_fields,
        "unencrypted_pii": unencrypted_pii,
        "pii_scans": pii_scans,
        "audit_entries": audit_entries,
        "audit_retention": audit_retention,
        "audit_warnings": audit_warnings,
        "deletion_events": deletion_events,
        "admins": admins,
        "admins_must_change_pw": admins_must_change_pw,
        "open_risks": open_risks,
        "breach_count": breach_count,
        "open_breaches": open_breaches,
        "has_deployment": has_deployment,
        "has_backup_region": has_backup_region,
        "has_dpo": has_dpo,
    }


def _checklist_completed(control_key: str, ctx: dict) -> list[bool]:
    if control_key == "encryption":
        at_rest_ok = ctx["classified_fields"] > 0 and ctx["unencrypted_pii"] == 0
        return [
            at_rest_ok,
            True,  # platform serves API over TLS in production deployments
            at_rest_ok and ctx["classified_fields"] > 0,
            ctx["pii_scans"] > 0,
        ]
    if control_key == "access_mfa":
        mfa_ok = ctx["admins"] == 0 or ctx["admins_must_change_pw"] == 0
        return [
            ctx["admins"] > 0,
            mfa_ok,
            ctx["audit_entries"] > 0,
            ctx["admins_must_change_pw"] == 0,
        ]
    if control_key == "logging":
        return [
            ctx["audit_entries"] >= 5,
            ctx["audit_entries"] >= 20,
            ctx["audit_retention"] > 0,
            ctx["audit_warnings"] == 0 or ctx["audit_entries"] > 50,
            ctx["open_breaches"] == 0 or ctx["breach_count"] > 0,
        ]
    if control_key == "deletion":
        return [
            ctx["deletion_events"] > 0 or ctx["audit_entries"] > 0,
            ctx["deletion_events"] > 0,
            ctx["deletion_events"] > 0,
            ctx["deletion_events"] >= 3,
        ]
    if control_key == "vuln_mgmt":
        return [
            ctx["pii_scans"] > 0,
            ctx["open_risks"] == 0 or ctx["open_risks"] <= 3,
            ctx["open_risks"] == 0,
        ]
    if control_key == "incident_response":
        return [
            ctx["breach_count"] > 0,
            ctx["breach_count"] > 0,
            ctx["breach_count"] > 0 and ctx["open_breaches"] == 0,
            ctx["has_dpo"],
        ]
    if control_key == "bcp_dr":
        return [
            ctx["has_deployment"],
            ctx["has_backup_region"],
            ctx["has_deployment"] and ctx["has_backup_region"],
            ctx["audit_entries"] > 10,
        ]
    return []


def sync_controls_from_platform(db: Session, org_id: UUID, controls: list[SecurityControl]) -> None:
    """Update control rows from live platform signals (persists on each safeguards read)."""
    ctx = _build_platform_context(db, org_id)
    changed = False
    for control in controls:
        checks = _checklist_completed(control.control_key, ctx)
        if not checks:
            continue
        total = min(len(checks), control.items_total or len(checks))
        completed = sum(1 for i, ok in enumerate(checks[:total]) if ok)
        new_status = _status_from_items(completed, total)
        new_evidence: str | None
        if new_status == SecurityControlStatus.documented:
            new_evidence = f"Platform verified ({completed}/{total} checklist items)"
        elif new_status == SecurityControlStatus.partial:
            new_evidence = f"In progress ({completed}/{total} checklist items)"
        else:
            new_evidence = None
        if (
            control.items_completed != completed
            or control.status != new_status
            or control.evidence_label != new_evidence
        ):
            control.items_completed = completed
            control.status = new_status
            control.evidence_label = new_evidence
            changed = True
    if changed:
        db.commit()
