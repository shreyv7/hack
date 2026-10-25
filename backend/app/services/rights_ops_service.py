from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.dsar import DataRightType, DataRightsRequest, DataRightsRequestStatus
from app.models.user import User
from app.schemas.rights_ops import RightsOpsDashboard, RightsOpsEscalate, RightsOpsRequestRead
from app.services.compliance_base import ComplianceBaseService
from app.core.rbac import Permission


class RightsOpsService(ComplianceBaseService):
    def _queue(
        self, user: User, right_type: DataRightType, *, org_id: UUID | None = None
    ) -> list[RightsOpsRequestRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == resolved,
                DataRightsRequest.right_type == right_type,
            )
            .order_by(DataRightsRequest.received_at.desc().nullslast())
            .all()
        )
        return [RightsOpsRequestRead.model_validate(r) for r in rows]

    def grievance_queue(self, user: User, *, org_id: UUID | None = None) -> list[RightsOpsRequestRead]:
        return self._queue(user, DataRightType.grievance, org_id=org_id)

    def nomination_queue(self, user: User, *, org_id: UUID | None = None) -> list[RightsOpsRequestRead]:
        return self._queue(user, DataRightType.nomination, org_id=org_id)

    def _dashboard(self, user: User, right_type: DataRightType, *, org_id: UUID | None = None) -> RightsOpsDashboard:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == resolved,
                DataRightsRequest.right_type == right_type,
            )
            .all()
        )
        now = datetime.now(timezone.utc)
        open_statuses = {
            DataRightsRequestStatus.pending_verification,
            DataRightsRequestStatus.received,
            DataRightsRequestStatus.in_review,
            DataRightsRequestStatus.response_ready,
        }
        open_rows = [r for r in rows if r.status in open_statuses]
        overdue = sum(1 for r in open_rows if r.due_at and r.due_at < now)
        due_soon = sum(
            1 for r in open_rows if r.due_at and now <= r.due_at <= now + timedelta(days=3)
        )
        resolved_rows = [r for r in rows if r.resolved_at and r.received_at]
        avg_days = None
        if resolved_rows:
            total_days = sum((r.resolved_at - r.received_at).days for r in resolved_rows)
            avg_days = round(total_days / len(resolved_rows), 1)
        ack_rate = 0.0
        if rows:
            ack_rate = round(sum(1 for r in rows if r.acknowledged_at) / len(rows) * 100, 1)
        return RightsOpsDashboard(
            total_open=len(open_rows),
            overdue=overdue,
            due_soon=due_soon,
            avg_resolution_days=avg_days,
            acknowledged_rate=ack_rate,
        )

    def grievance_dashboard(self, user: User, *, org_id: UUID | None = None) -> RightsOpsDashboard:
        return self._dashboard(user, DataRightType.grievance, org_id=org_id)

    def nomination_dashboard(self, user: User, *, org_id: UUID | None = None) -> RightsOpsDashboard:
        return self._dashboard(user, DataRightType.nomination, org_id=org_id)

    def escalate_grievance(
        self, user: User, request_id: UUID, body: RightsOpsEscalate, *, org_id: UUID | None = None
    ) -> RightsOpsRequestRead:
        return self._escalate(user, request_id, DataRightType.grievance, body, org_id=org_id)

    def escalate_nomination(
        self, user: User, request_id: UUID, body: RightsOpsEscalate, *, org_id: UUID | None = None
    ) -> RightsOpsRequestRead:
        return self._escalate(user, request_id, DataRightType.nomination, body, org_id=org_id)

    def _escalate(
        self,
        user: User,
        request_id: UUID,
        right_type: DataRightType,
        body: RightsOpsEscalate,
        *,
        org_id: UUID | None = None,
    ) -> RightsOpsRequestRead:
        self._require_permission(user, Permission.COMPLIANCE_MANAGE)
        resolved = self._resolve_org_id(user, org_id)
        row = (
            self.db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.id == request_id,
                DataRightsRequest.organization_id == resolved,
                DataRightsRequest.right_type == right_type,
            )
            .first()
        )
        if row is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Request not found")
        if body.assigned_to_user_id:
            row.assigned_to_user_id = body.assigned_to_user_id
        if row.status == DataRightsRequestStatus.received:
            row.status = DataRightsRequestStatus.in_review
        self.db.commit()
        self.db.refresh(row)
        return RightsOpsRequestRead.model_validate(row)
