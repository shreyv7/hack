from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class RightsOpsRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tracking_id: str
    right_type: str
    requester_name: str
    requester_email: str | None
    status: str
    verification_status: str
    received_at: datetime | None
    due_at: datetime | None
    ack_due_at: datetime | None
    acknowledged_at: datetime | None
    assigned_to_user_id: UUID | None
    resolved_at: datetime | None


class RightsOpsDashboard(BaseModel):
    total_open: int
    overdue: int
    due_soon: int
    avg_resolution_days: float | None
    acknowledged_rate: float


class RightsOpsEscalate(BaseModel):
    assigned_to_user_id: UUID | None = None
    note: str | None = None
