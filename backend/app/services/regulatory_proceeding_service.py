import csv
import io
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import Permission
from app.models.compliance import AuditEventType, AuditSeverity
from app.models.regulatory_proceeding import (
    RegulatoryProceeding,
    RegulatoryProceedingStatus,
    RegulatoryProceedingType,
)
from app.models.user import User
from app.schemas.regulatory_proceeding import (
    RegulatoryCorrespondenceEntry,
    RegulatoryProceedingCreate,
    RegulatoryProceedingRead,
    RegulatoryProceedingSummary,
    RegulatoryProceedingUpdate,
)
from app.services.audit_log_service import AuditLogService
from app.services.compliance_base import ComplianceBaseService

VALID_STATUS_TRANSITIONS: dict[RegulatoryProceedingStatus, set[RegulatoryProceedingStatus]] = {
    RegulatoryProceedingStatus.open: {
        RegulatoryProceedingStatus.in_progress,
        RegulatoryProceedingStatus.closed,
    },
    RegulatoryProceedingStatus.in_progress: {
        RegulatoryProceedingStatus.submitted,
        RegulatoryProceedingStatus.closed,
        RegulatoryProceedingStatus.appealed,
    },
    RegulatoryProceedingStatus.submitted: {
        RegulatoryProceedingStatus.closed,
        RegulatoryProceedingStatus.appealed,
    },
    RegulatoryProceedingStatus.appealed: {
        RegulatoryProceedingStatus.in_progress,
        RegulatoryProceedingStatus.closed,
    },
    RegulatoryProceedingStatus.closed: set(),
}


class RegulatoryProceedingService(ComplianceBaseService):
    def _audit(self, user: User, org_id: UUID, action: str, details: str, proceeding_id: UUID) -> None:
        AuditLogService(self.db).record_event(
            org_id,
            user=user,
            action=action,
            details=details,
            event_type=AuditEventType.configuration,
            severity=AuditSeverity.info,
            resource_type="regulatory_proceeding",
            resource_id=str(proceeding_id),
        )

    def _next_ref(self, org_id: UUID) -> str:
        count = self.db.query(RegulatoryProceeding).filter(RegulatoryProceeding.organization_id == org_id).count()
        return f"REG-{count + 1:04d}"

    def list_proceedings(self, user: User, *, org_id: UUID | None = None) -> list[RegulatoryProceedingRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(RegulatoryProceeding)
            .filter(RegulatoryProceeding.organization_id == resolved)
            .order_by(RegulatoryProceeding.created_at.desc())
            .all()
        )
        return [RegulatoryProceedingRead.model_validate(r) for r in rows]

    def get_summary(self, user: User, *, org_id: UUID | None = None) -> RegulatoryProceedingSummary:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(RegulatoryProceeding)
            .filter(RegulatoryProceeding.organization_id == resolved)
            .all()
        )
        now = datetime.now(timezone.utc)
        due_soon_cutoff = now + timedelta(days=7)
        return RegulatoryProceedingSummary(
            open_count=sum(1 for r in rows if r.status == RegulatoryProceedingStatus.open),
            in_progress_count=sum(1 for r in rows if r.status == RegulatoryProceedingStatus.in_progress),
            overdue_count=sum(
                1
                for r in rows
                if r.due_at is not None
                and r.due_at < now
                and r.status not in (RegulatoryProceedingStatus.closed, RegulatoryProceedingStatus.submitted)
            ),
            due_soon_count=sum(
                1
                for r in rows
                if r.due_at is not None
                and now <= r.due_at <= due_soon_cutoff
                and r.status not in (RegulatoryProceedingStatus.closed, RegulatoryProceedingStatus.submitted)
            ),
            closed_count=sum(1 for r in rows if r.status == RegulatoryProceedingStatus.closed),
            total_penalty_exposure_crores=sum(r.penalty_exposure_crores or 0 for r in rows),
        )

    def create(
        self, user: User, body: RegulatoryProceedingCreate, *, org_id: UUID | None = None
    ) -> RegulatoryProceedingRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        row = RegulatoryProceeding(
            organization_id=resolved,
            proceeding_ref=self._next_ref(resolved),
            proceeding_type=RegulatoryProceedingType(body.proceeding_type),
            title=body.title,
            description=body.description,
            board_reference=body.board_reference,
            penalty_exposure_crores=body.penalty_exposure_crores,
            due_at=body.due_at,
            assigned_to_user_id=body.assigned_to_user_id,
            evidence_pack=body.evidence_pack,
            correspondence_log=body.correspondence_log,
            linked_breach_id=body.linked_breach_id,
            linked_audit_refs=body.linked_audit_refs,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        self._audit(
            user,
            resolved,
            f"Regulatory proceeding opened: {row.proceeding_ref}",
            f"Type: {row.proceeding_type.value}; title: {row.title}",
            row.id,
        )
        self.db.commit()
        return RegulatoryProceedingRead.model_validate(row)

    def update(
        self, user: User, proceeding_id: UUID, body: RegulatoryProceedingUpdate, *, org_id: UUID | None = None
    ) -> RegulatoryProceedingRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        row = (
            self.db.query(RegulatoryProceeding)
            .filter(
                RegulatoryProceeding.id == proceeding_id,
                RegulatoryProceeding.organization_id == resolved,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proceeding not found")

        payload = body.model_dump(exclude_unset=True)
        if "status" in payload and payload["status"] is not None:
            new_status = RegulatoryProceedingStatus(payload["status"])
            allowed = VALID_STATUS_TRANSITIONS.get(row.status, set())
            if new_status != row.status and new_status not in allowed:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status transition from {row.status.value} to {new_status.value}",
                )
            if new_status == RegulatoryProceedingStatus.submitted and row.submitted_at is None:
                row.submitted_at = datetime.now(timezone.utc)
            if new_status == RegulatoryProceedingStatus.closed and row.closed_at is None:
                row.closed_at = datetime.now(timezone.utc)

        for key, value in payload.items():
            if key == "proceeding_type" and value is not None:
                setattr(row, key, RegulatoryProceedingType(value))
            elif key == "status" and value is not None:
                setattr(row, key, RegulatoryProceedingStatus(value))
            else:
                setattr(row, key, value)
        self.db.commit()
        self.db.refresh(row)
        self._audit(
            user,
            resolved,
            f"Regulatory proceeding updated: {row.proceeding_ref}",
            f"Status: {row.status.value}",
            row.id,
        )
        self.db.commit()
        return RegulatoryProceedingRead.model_validate(row)

    def add_correspondence(
        self,
        user: User,
        proceeding_id: UUID,
        body: RegulatoryCorrespondenceEntry,
        *,
        org_id: UUID | None = None,
    ) -> RegulatoryProceedingRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        row = (
            self.db.query(RegulatoryProceeding)
            .filter(
                RegulatoryProceeding.id == proceeding_id,
                RegulatoryProceeding.organization_id == resolved,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proceeding not found")

        log = list(row.correspondence_log or [])
        entry = {
            "date": datetime.now(timezone.utc).isoformat(),
            "direction": body.direction,
            "subject": body.subject,
            "summary": body.summary,
            "author": body.author or (user.full_name or user.email),
        }
        log.append(entry)
        row.correspondence_log = log
        self.db.commit()
        self.db.refresh(row)
        self._audit(
            user,
            resolved,
            f"Correspondence logged for {row.proceeding_ref}",
            f"{body.direction}: {body.subject}",
            row.id,
        )
        self.db.commit()
        return RegulatoryProceedingRead.model_validate(row)

    def assemble_evidence_pack(self, user: User, proceeding_id: UUID, *, org_id: UUID | None = None) -> RegulatoryProceedingRead:
        """Pull references from audit, breach, RoPA without duplicating data."""
        from app.models.compliance import AuditLogEntry, BreachIncident
        from app.models.ropa import ProcessingActivity

        resolved = self._resolve_org_id(user, org_id)
        row = (
            self.db.query(RegulatoryProceeding)
            .filter(
                RegulatoryProceeding.id == proceeding_id,
                RegulatoryProceeding.organization_id == resolved,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proceeding not found")

        pack: list[dict] = list(row.evidence_pack or [])
        if row.linked_breach_id:
            breach = self.db.get(BreachIncident, row.linked_breach_id)
            if breach and breach.organization_id == resolved:
                pack.append({"type": "breach", "ref": breach.incident_ref, "id": str(breach.id)})
        recent_audit = (
            self.db.query(AuditLogEntry)
            .filter(AuditLogEntry.organization_id == resolved)
            .order_by(AuditLogEntry.occurred_at.desc())
            .limit(10)
            .all()
        )
        for entry in recent_audit:
            pack.append({"type": "audit", "action": entry.action, "id": str(entry.id)})
        ropa_count = (
            self.db.query(ProcessingActivity)
            .filter(
                ProcessingActivity.organization_id == resolved,
                ProcessingActivity.status == "published",
            )
            .count()
        )
        pack.append({"type": "ropa", "published_activities": ropa_count})
        row.evidence_pack = pack
        self.db.commit()
        self.db.refresh(row)
        self._audit(
            user,
            resolved,
            f"Evidence pack assembled for {row.proceeding_ref}",
            f"{len(pack)} evidence items in pack",
            row.id,
        )
        self.db.commit()
        return RegulatoryProceedingRead.model_validate(row)

    def export_csv(self, user: User, *, org_id: UUID | None = None) -> str:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(RegulatoryProceeding)
            .filter(RegulatoryProceeding.organization_id == resolved)
            .order_by(RegulatoryProceeding.created_at.desc())
            .all()
        )
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "Reference",
                "Title",
                "Type",
                "Status",
                "Board Reference",
                "Due At",
                "Submitted At",
                "Closed At",
                "Penalty Exposure (Cr)",
                "Assignee User ID",
                "Linked Breach ID",
                "Evidence Items",
                "Correspondence Entries",
                "Created At",
            ]
        )
        for row in rows:
            writer.writerow(
                [
                    row.proceeding_ref,
                    row.title,
                    row.proceeding_type.value,
                    row.status.value,
                    row.board_reference or "",
                    row.due_at.isoformat() if row.due_at else "",
                    row.submitted_at.isoformat() if row.submitted_at else "",
                    row.closed_at.isoformat() if row.closed_at else "",
                    row.penalty_exposure_crores or 0,
                    str(row.assigned_to_user_id) if row.assigned_to_user_id else "",
                    str(row.linked_breach_id) if row.linked_breach_id else "",
                    len(row.evidence_pack or []),
                    len(row.correspondence_log or []),
                    row.created_at.isoformat() if row.created_at else "",
                ]
            )
        return buffer.getvalue()
