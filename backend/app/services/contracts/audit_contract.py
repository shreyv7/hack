from uuid import UUID

from sqlalchemy.orm import Session

from app.models.compliance import AuditEventType, AuditSeverity
from app.models.user import User
from app.services.audit_log_service import AuditLogService


class AuditContract:
    @staticmethod
    def log_event(
        db: Session,
        org_id: UUID,
        *,
        user: User | None = None,
        user_id: UUID | None = None,
        action: str,
        details: str = "",
        event_type: AuditEventType = AuditEventType.configuration,
        severity: AuditSeverity = AuditSeverity.info,
        resource_type: str | None = None,
        resource_id: str | None = None,
        commit: bool = True,
    ) -> None:
        try:
            audit_svc = AuditLogService(db)
            actor = user
            if actor is None and user_id:
                actor = db.query(User).filter(User.id == user_id).first()
            audit_svc.record_event(
                org_id,
                user=actor,
                action=action,
                details=details,
                event_type=event_type,
                severity=severity,
                resource_type=resource_type,
                resource_id=resource_id,
            )
            if commit:
                db.commit()
        except Exception as err:
            print(f"[AuditContract Error]: Failed to write audit log: {err}")
            db.rollback()

    @staticmethod
    def log_campaign_event(
        db: Session, org_id: UUID, user_id: UUID | None, action: str, details: str
    ) -> None:
        AuditContract.log_event(
            db,
            org_id,
            user_id=user_id,
            action=action,
            details=details,
            event_type=AuditEventType.consent,
            resource_type="notice_campaign",
        )
