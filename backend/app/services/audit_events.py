"""Thin helper to record audit events from other services."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.compliance import AuditEventType, AuditSeverity
from app.models.user import User
from app.services.audit_log_service import AuditLogService


def record_audit_event(
    db: Session,
    org_id: UUID,
    *,
    user: User | None = None,
    action: str,
    details: str = "",
    event_type: AuditEventType = AuditEventType.configuration,
    severity: AuditSeverity = AuditSeverity.info,
    resource_type: str | None = None,
    resource_id: str | None = None,
    commit: bool = True,
) -> None:
    svc = AuditLogService(db)
    svc.record_event(
        org_id,
        user=user,
        action=action,
        details=details,
        event_type=event_type,
        severity=severity,
        resource_type=resource_type,
        resource_id=resource_id,
    )
    if commit:
        db.commit()
