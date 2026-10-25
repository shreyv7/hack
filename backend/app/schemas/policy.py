from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.policy import (
    AcknowledgementStatus,
    PolicyType,
    PolicyVersionStatus,
)


class PolicyCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    policy_type: PolicyType = PolicyType.custom
    content: str = ""
    summary: str | None = None
    business_unit_id: UUID | None = None


class PolicyUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    policy_type: PolicyType | None = None


class PolicyVersionCreate(BaseModel):
    content: str
    summary: str | None = None
    effective_date: datetime | None = None


class PolicyVersionUpdate(BaseModel):
    content: str | None = None
    summary: str | None = None
    effective_date: datetime | None = None


class PolicyVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    policy_id: UUID
    version_number: int
    status: PolicyVersionStatus
    content: str
    summary: str | None
    effective_date: datetime | None
    published_at: datetime | None
    published_by_user_id: UUID | None
    reviewed_by_user_id: UUID | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    published_by_name: str | None = None
    reviewed_by_name: str | None = None


class PolicySummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    policy_type: PolicyType
    status: PolicyVersionStatus | None = None
    version_label: str
    updated_at: datetime
    pending_acknowledgements: int = 0
    archived_at: datetime | None = None


class PolicyDetailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    policy_type: PolicyType
    current_live_version_id: UUID | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime
    versions: list[PolicyVersionRead] = Field(default_factory=list)


class AcknowledgementSummaryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    policy_id: UUID
    policy_title: str
    version: str
    audience: str
    sent: int = 0
    acknowledged: int = 0
    pending: int = 0
    overdue: int = 0


class AcknowledgementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    policy_id: UUID
    policy_version_id: UUID
    audience: str
    recipient_id: str
    recipient_name: str
    recipient_email: str | None
    status: AcknowledgementStatus
    sent_at: datetime | None
    acknowledged_at: datetime | None
    reminder_count: int
    last_reminder_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PolicyActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action: str
    policy_title: str
    policy_version: str
    user_name: str
    created_at: datetime


class PolicyStatsRead(BaseModel):
    active_count: int = 0
    total_versions: int = 0
    pending_acknowledgements: int = 0
    auto_published_this_year: int = 0


class SendReminderRequest(BaseModel):
    policy_id: UUID
    version_id: UUID | None = None
    channel: str = Field(default="email")


class PolicyGenerateFromRopaRequest(BaseModel):
    policy_type: PolicyType = PolicyType.privacy


class PolicyGenerateFromRopaResponse(BaseModel):
    policy: PolicyDetailRead
    source: str  # vertex | bedrock | rule_based
    model_id: str | None = None
    is_new_policy: bool = True
