from typing import Any
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.consent import ConsentNotice, ConsentNoticeVersion
from app.models.notice_delivery import RecipientDeliveryStatus


class NoticeContract:
    @staticmethod
    def get_notice(db: Session, notice_id: UUID) -> dict[str, Any] | None:
        notice = db.query(ConsentNotice).filter(ConsentNotice.id == notice_id).first()
        if not notice:
            return None
        return {
            "id": notice.id,
            "internal_name": notice.internal_name,
            "current_live_version_id": notice.current_live_version_id,
            "archived_at": notice.archived_at,
        }

    @staticmethod
    def get_notice_version(db: Session, version_id: UUID) -> dict[str, Any] | None:
        version = db.query(ConsentNoticeVersion).filter(ConsentNoticeVersion.id == version_id).first()
        if not version:
            return None
        return {
            "id": version.id,
            "notice_id": version.notice_id,
            "version_number": version.version_number,
            "status": version.status,
            "display_name": version.display_name,
            "language": version.language,
            "opening_statement": version.opening_statement,
        }

    @staticmethod
    def get_acknowledged_users(db: Session, notice_id: UUID, version_number: int) -> set[str]:
        # Queries RecipientDeliveryStatus to find users who have acknowledged the notice at version_number or higher
        records = db.query(RecipientDeliveryStatus).join(
            ConsentNoticeVersion, RecipientDeliveryStatus.last_acknowledged_version_id == ConsentNoticeVersion.id
        ).filter(
            RecipientDeliveryStatus.notice_id == notice_id,
            ConsentNoticeVersion.version_number >= version_number
        ).all()
        
        return {r.recipient_id for r in records}
