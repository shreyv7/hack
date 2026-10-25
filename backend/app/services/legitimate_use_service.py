import csv
import io
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import Permission
from app.models.compliance import AuditEventType, AuditSeverity
from app.models.legitimate_use import LegitimateUseGround, LegitimateUseRecord, LegitimateUseStatus
from app.models.user import User
from app.schemas.legitimate_use import (
    LegitimateUseCreate,
    LegitimateUseMarkReviewed,
    LegitimateUseRead,
    LegitimateUseSummary,
    LegitimateUseUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.compliance_base import ComplianceBaseService


class LegitimateUseService(ComplianceBaseService):
    def _audit(self, user: User, org_id: UUID, action: str, details: str, record_id: UUID) -> None:
        AuditLogService(self.db).record_event(
            org_id,
            user=user,
            action=action,
            details=details,
            event_type=AuditEventType.configuration,
            severity=AuditSeverity.info,
            resource_type="legitimate_use_record",
            resource_id=str(record_id),
        )

    def list_records(self, user: User, *, org_id: UUID | None = None) -> list[LegitimateUseRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.organization_id == resolved)
            .order_by(LegitimateUseRecord.updated_at.desc())
            .all()
        )
        return [LegitimateUseRead.model_validate(r) for r in rows]

    def get_summary(self, user: User, *, org_id: UUID | None = None) -> LegitimateUseSummary:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.organization_id == resolved)
            .all()
        )
        today = date.today()
        due = sum(
            1
            for r in rows
            if r.review_date is not None and r.review_date <= today and r.status == LegitimateUseStatus.active
        )
        return LegitimateUseSummary(
            total_records=len(rows),
            active_records=sum(1 for r in rows if r.status == LegitimateUseStatus.active),
            under_review_records=sum(1 for r in rows if r.status == LegitimateUseStatus.under_review),
            due_for_review=due,
        )

    def create(self, user: User, body: LegitimateUseCreate, *, org_id: UUID | None = None) -> LegitimateUseRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        record = LegitimateUseRecord(
            organization_id=resolved,
            title=body.title,
            ground_type=LegitimateUseGround(body.ground_type),
            legal_rationale=body.legal_rationale,
            approver_name=body.approver_name,
            approver_user_id=body.approver_user_id,
            retention_basis=body.retention_basis,
            downstream_sharing=body.downstream_sharing,
            review_date=body.review_date,
            exemption_tags=body.exemption_tags,
            evidence_refs=body.evidence_refs,
            status=LegitimateUseStatus(body.status),
            ropa_activity_id=body.ropa_activity_id,
        )
        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)
        self._audit(
            user,
            resolved,
            f"Legitimate use record created: {record.title}",
            f"Ground: {record.ground_type.value}; status: {record.status.value}",
            record.id,
        )
        self.db.commit()
        return LegitimateUseRead.model_validate(record)

    def update(
        self, user: User, record_id: UUID, body: LegitimateUseUpdate, *, org_id: UUID | None = None
    ) -> LegitimateUseRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        record = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.id == record_id, LegitimateUseRecord.organization_id == resolved)
            .first()
        )
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Legitimate use record not found")
        for key, value in body.model_dump(exclude_unset=True).items():
            if key == "ground_type" and value is not None:
                setattr(record, key, LegitimateUseGround(value))
            elif key == "status" and value is not None:
                setattr(record, key, LegitimateUseStatus(value))
            else:
                setattr(record, key, value)
        record.last_reviewed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(record)
        self._audit(
            user,
            resolved,
            f"Legitimate use record updated: {record.title}",
            f"Record ID: {record.id}",
            record.id,
        )
        self.db.commit()
        return LegitimateUseRead.model_validate(record)

    def mark_reviewed(
        self,
        user: User,
        record_id: UUID,
        body: LegitimateUseMarkReviewed,
        *,
        org_id: UUID | None = None,
    ) -> LegitimateUseRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        record = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.id == record_id, LegitimateUseRecord.organization_id == resolved)
            .first()
        )
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Legitimate use record not found")
        record.last_reviewed_at = datetime.now(timezone.utc)
        if body.review_date is not None:
            record.review_date = body.review_date
        if record.status == LegitimateUseStatus.under_review:
            record.status = LegitimateUseStatus.active
        self.db.commit()
        self.db.refresh(record)
        details = body.notes or "Periodic review completed."
        self._audit(
            user,
            resolved,
            f"Legitimate use record marked reviewed: {record.title}",
            details,
            record.id,
        )
        self.db.commit()
        return LegitimateUseRead.model_validate(record)

    def delete(self, user: User, record_id: UUID, *, org_id: UUID | None = None) -> None:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        record = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.id == record_id, LegitimateUseRecord.organization_id == resolved)
            .first()
        )
        if record is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Legitimate use record not found")
        title = record.title
        AuditLogService(self.db).record_event(
            resolved,
            user=user,
            action=f"Legitimate use record deleted: {title}",
            details=f"Record ID: {record_id}",
            event_type=AuditEventType.deletion,
            severity=AuditSeverity.warning,
            resource_type="legitimate_use_record",
            resource_id=str(record_id),
        )
        self.db.delete(record)
        self.db.commit()

    def export_csv(self, user: User, *, org_id: UUID | None = None) -> str:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(LegitimateUseRecord)
            .filter(LegitimateUseRecord.organization_id == resolved)
            .order_by(LegitimateUseRecord.title.asc())
            .all()
        )
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Title",
                "Ground Type",
                "Status",
                "Legal Rationale",
                "Approver",
                "Review Date",
                "Last Reviewed At",
                "Retention Basis",
                "Downstream Sharing",
                "Exemption Tags",
                "Evidence Refs",
                "RoPA Activity ID",
                "Created At",
                "Updated At",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.title,
                    row.ground_type.value,
                    row.status.value,
                    row.legal_rationale,
                    row.approver_name or "",
                    row.review_date.isoformat() if row.review_date else "",
                    row.last_reviewed_at.isoformat() if row.last_reviewed_at else "",
                    row.retention_basis or "",
                    row.downstream_sharing or "",
                    "; ".join(row.exemption_tags or []),
                    "; ".join(row.evidence_refs or []),
                    str(row.ropa_activity_id) if row.ropa_activity_id else "",
                    row.created_at.isoformat() if row.created_at else "",
                    row.updated_at.isoformat() if row.updated_at else "",
                ]
            )
        return buffer.getvalue()
