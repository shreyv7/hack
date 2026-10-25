from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class RegulatoryProceedingCreate(BaseModel):
    proceeding_type: str
    title: str
    description: str | None = None
    board_reference: str | None = None
    penalty_exposure_crores: int | None = None
    due_at: datetime | None = None
    assigned_to_user_id: UUID | None = None
    evidence_pack: list[dict[str, Any]] = Field(default_factory=list)
    correspondence_log: list[dict[str, Any]] = Field(default_factory=list)
    linked_breach_id: UUID | None = None
    linked_audit_refs: list[str] = Field(default_factory=list)


class RegulatoryProceedingUpdate(BaseModel):
    proceeding_type: str | None = None
    status: str | None = None
    title: str | None = None
    description: str | None = None
    board_reference: str | None = None
    penalty_exposure_crores: int | None = None
    due_at: datetime | None = None
    submitted_at: datetime | None = None
    closed_at: datetime | None = None
    assigned_to_user_id: UUID | None = None
    evidence_pack: list[dict[str, Any]] | None = None
    correspondence_log: list[dict[str, Any]] | None = None
    linked_breach_id: UUID | None = None
    linked_audit_refs: list[str] | None = None


class RegulatoryProceedingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    proceeding_ref: str
    proceeding_type: str
    status: str
    title: str
    description: str | None
    board_reference: str | None
    penalty_exposure_crores: int | None
    due_at: datetime | None
    submitted_at: datetime | None
    closed_at: datetime | None
    assigned_to_user_id: UUID | None
    evidence_pack: list
    correspondence_log: list
    linked_breach_id: UUID | None
    linked_audit_refs: list
    created_at: datetime
    updated_at: datetime


class RegulatoryProceedingSummary(BaseModel):
    open_count: int
    in_progress_count: int
    overdue_count: int
    due_soon_count: int
    closed_count: int
    total_penalty_exposure_crores: int


class RegulatoryCorrespondenceEntry(BaseModel):
    direction: str
    subject: str
    summary: str
    author: str | None = None
