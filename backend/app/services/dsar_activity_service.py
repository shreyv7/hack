"""Append-only activity log for data-rights requests."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.dsar import (
    DataRightType,
    DataRightsActivityAction,
    DataRightsActivityEvent,
    DataRightsRequest,
    DataRightsRequestStatus,
)
from app.models.user import User


def user_display_name(user: User | None, fallback: str = "System") -> str:
    if user is None:
        return fallback
    return (user.full_name or user.email or str(user.id)).strip() or fallback


def record_dsar_activity(
    db: Session,
    req: DataRightsRequest,
    action: DataRightsActivityAction,
    *,
    actor: User | None = None,
    actor_name: str | None = None,
    assignee: User | None = None,
    assignee_name: str | None = None,
    message: str,
    metadata: dict | None = None,
    commit: bool = False,
) -> DataRightsActivityEvent:
    row = DataRightsActivityEvent(
        organization_id=req.organization_id,
        request_id=req.id,
        tracking_id=req.tracking_id,
        right_type=req.right_type,
        action=action,
        actor_user_id=actor.id if actor else None,
        actor_name=actor_name or user_display_name(actor, fallback="Data principal"),
        assignee_user_id=assignee.id if assignee else None,
        assignee_name=assignee_name,
        message=message,
        event_metadata=metadata or {},
    )
    db.add(row)
    if commit:
        db.commit()
    return row


def lookup_user_name(db: Session, user_id: UUID | None) -> str | None:
    if user_id is None:
        return None
    user = db.get(User, user_id)
    return user_display_name(user) if user else None


STATUS_LABELS = {
    DataRightsRequestStatus.pending_verification: "Awaiting verification",
    DataRightsRequestStatus.received: "Received",
    DataRightsRequestStatus.in_review: "In review",
    DataRightsRequestStatus.response_ready: "Response ready",
    DataRightsRequestStatus.completed: "Completed",
    DataRightsRequestStatus.rejected: "Rejected",
}


def status_label(status: DataRightsRequestStatus) -> str:
    return STATUS_LABELS.get(status, status.value)
