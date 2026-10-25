from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from app.models.dsar import (
    DataRightType,
    DataRightsActivityAction,
    DataRightsRequestStatus,
    VerificationStatus,
)
from app.utils.india_phone import PHONE_ERROR, try_normalize_india_phone

VerificationMethod = Literal["email", "sms"]


class PortalRequestCreate(BaseModel):
    right_type: DataRightType
    requester_name: str = Field(min_length=1, max_length=255)
    requester_email: EmailStr | None = None
    requester_phone: str | None = None
    request_details: str = Field(min_length=1)
    extra_data: dict[str, Any] = Field(default_factory=dict)
    verification_method: VerificationMethod | None = None

    @field_validator("requester_phone", mode="before")
    @classmethod
    def validate_requester_phone(cls, value: str | None) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        try:
            return try_normalize_india_phone(str(value))
        except ValueError as exc:
            raise ValueError(PHONE_ERROR) from exc

    @model_validator(mode="after")
    def require_contact_channel(self) -> PortalRequestCreate:
        if not self.requester_email and not self.requester_phone:
            raise ValueError("Email or phone is required")
        return self


class PortalRequestCreated(BaseModel):
    tracking_id: str
    status: DataRightsRequestStatus
    verification_required: bool = True
    verification_method: VerificationMethod
    contact_hint: str
    message: str


class OtpVerifyRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None
    otp_code: str = Field(min_length=4, max_length=8)

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        try:
            return try_normalize_india_phone(str(value))
        except ValueError as exc:
            raise ValueError(PHONE_ERROR) from exc

    @model_validator(mode="after")
    def require_contact(self) -> OtpVerifyRequest:
        if not self.email and not self.phone:
            raise ValueError("Email or phone is required")
        return self


class OtpVerifyResponse(BaseModel):
    verified: bool
    tracking_id: str
    status: DataRightsRequestStatus
    message: str


class StatusCheckRequest(BaseModel):
    email: EmailStr | None = None
    phone: str | None = None

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: str | None) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        try:
            return try_normalize_india_phone(str(value))
        except ValueError as exc:
            raise ValueError(PHONE_ERROR) from exc

    @model_validator(mode="after")
    def require_contact(self) -> StatusCheckRequest:
        if not self.email and not self.phone:
            raise ValueError("Email or phone is required")
        return self


class StatusCheckResponse(BaseModel):
    tracking_id: str
    right_type: DataRightType
    status: DataRightsRequestStatus
    verification_status: VerificationStatus
    verification_required: bool
    verification_method: VerificationMethod | None = None
    due_at: datetime | None = None
    breached: bool = False
    days_remaining: int | None = None
    ack_due_at: datetime | None = None
    acknowledged: bool = False
    closure_available: bool = False
    message: str


class PortalBrandingRead(BaseModel):
    organization_name: str
    organization_slug: str
    dpo_name: str | None = None
    dpo_email: str | None = None
    contact_email: str | None = None


class PortalFormField(BaseModel):
    id: str
    type: str
    label: str
    placeholder: str = ""
    required: bool = False
    key: str
    locked: bool = False
    options: list[str] | None = None


class PortalFormSchema(BaseModel):
    right_type: DataRightType
    help_text: str
    fields: list[PortalFormField]


class PortalFormsRead(BaseModel):
    forms: list[PortalFormSchema]


class PortalFormUpdate(BaseModel):
    help_text: str | None = None
    fields: list[PortalFormField]


class DataRightsRequestRead(BaseModel):
    id: UUID
    tracking_id: str
    right_type: DataRightType
    requester_name: str
    requester_email: str | None
    requester_phone: str | None
    request_details: str
    extra_data: dict[str, Any]
    verification_status: VerificationStatus
    status: DataRightsRequestStatus
    received_at: datetime | None
    due_at: datetime | None
    breached_at: datetime | None
    ack_due_at: datetime | None
    acknowledged_at: datetime | None
    ack_breached_at: datetime | None
    assigned_to_user_id: UUID | None
    requires_legal_signoff: bool = False
    legal_signed_off_by_user_id: UUID | None = None
    closure_text: str | None
    resolved_at: datetime | None
    fulfillment_metadata: dict[str, Any] | None = None
    retention_hold_applied: bool = False
    created_at: datetime
    updated_at: datetime
    days_remaining: int | None = None
    ack_hours_remaining: int | None = None
    sla_bucket: str | None = None
    sla_days: int | None = None

    model_config = {"from_attributes": True}


class DataRightsRequestUpdate(BaseModel):
    status: DataRightsRequestStatus | None = None
    assigned_to_user_id: UUID | None = None
    acknowledge_grievance: bool | None = None
    requires_legal_signoff: bool | None = None


class DataRightsRequestBatchUpdate(BaseModel):
    request_ids: list[UUID] = Field(min_length=1, max_length=500)
    assigned_to_user_id: UUID | None = None
    status: DataRightsRequestStatus | None = None
    advance_status: bool = False

    @model_validator(mode="after")
    def require_mutation(self) -> DataRightsRequestBatchUpdate:
        if not self.advance_status and self.status is None and self.assigned_to_user_id is None:
            raise ValueError("Provide assigned_to_user_id, status, or advance_status")
        return self


class DataRightsRequestBatchResult(BaseModel):
    updated: int
    skipped: int


class DataRightsRequestResolve(BaseModel):
    closure_notes: str | None = None


class DsarCommentCreate(BaseModel):
    message: str = Field(min_length=1, max_length=4000)


class SlaMetricsRead(BaseModel):
    on_track: int = 0
    due_24h: int = 0
    due_7d: int = 0
    breached: int = 0
    ack_overdue: int = 0
    pending_verification: int = 0
    total_active: int = 0


class SlaMatrixRow(BaseModel):
    right_type: DataRightType
    sla_days: int
    sla_label: str | None = None
    avg_response_days: float | None
    success_rate: float | None
    breaches: int
    total: int


class DsarDashboardRead(BaseModel):
    metrics: SlaMetricsRead
    matrix: list[SlaMatrixRow]
    requests: list[DataRightsRequestRead]
    breached_requests: list[DataRightsRequestRead]


class SlaEngineRunResult(BaseModel):
    processed: int
    reminders_sent: int
    breaches_marked: int


class DsarActivityEventRead(BaseModel):
    id: UUID
    created_at: datetime
    tracking_id: str
    right_type: DataRightType
    action: DataRightsActivityAction
    actor_user_id: UUID | None
    actor_name: str
    assignee_user_id: UUID | None
    assignee_name: str | None
    message: str
    event_metadata: dict[str, Any] = Field(default_factory=dict)
    requester_name: str | None = None
    current_status: DataRightsRequestStatus | None = None
    current_assignee_user_id: UUID | None = None

    model_config = {"from_attributes": True}


class DsarActivityLogRead(BaseModel):
    items: list[DsarActivityEventRead]
    total: int
