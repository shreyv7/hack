from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class LegitimateUseCreate(BaseModel):
    title: str
    ground_type: str
    legal_rationale: str
    approver_name: str | None = None
    approver_user_id: UUID | None = None
    retention_basis: str | None = None
    downstream_sharing: str | None = None
    review_date: date | None = None
    exemption_tags: list[str] = Field(default_factory=list)
    evidence_refs: list[str] = Field(default_factory=list)
    status: str = "active"
    ropa_activity_id: UUID | None = None


class LegitimateUseUpdate(BaseModel):
    title: str | None = None
    ground_type: str | None = None
    legal_rationale: str | None = None
    approver_name: str | None = None
    approver_user_id: UUID | None = None
    retention_basis: str | None = None
    downstream_sharing: str | None = None
    review_date: date | None = None
    exemption_tags: list[str] | None = None
    evidence_refs: list[str] | None = None
    status: str | None = None
    ropa_activity_id: UUID | None = None


class LegitimateUseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    title: str
    ground_type: str
    legal_rationale: str
    approver_name: str | None
    approver_user_id: UUID | None
    retention_basis: str | None
    downstream_sharing: str | None
    review_date: date | None
    exemption_tags: list
    evidence_refs: list
    status: str
    ropa_activity_id: UUID | None
    last_reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LegitimateUseSummary(BaseModel):
    total_records: int
    active_records: int
    under_review_records: int
    due_for_review: int


class LegitimateUseMarkReviewed(BaseModel):
    review_date: date | None = None
    notes: str | None = None
