from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.consent_banking import ConsentIdentifierInput


class StaffMetadataInput(BaseModel):
    branch_code: str | None = Field(None, max_length=64)
    staff_id: str | None = Field(None, max_length=128)
    merchant_id: str | None = Field(None, max_length=128)
    terminal_id: str | None = Field(None, max_length=128)


class ConsentCaptureSessionCreate(BaseModel):
    client_session_id: str = Field(..., min_length=1, max_length=128)
    journey_key: str = Field(..., min_length=1, max_length=64)
    capture_channel: str | None = Field(None, max_length=64)
    capture_mode: Literal["online", "offline"] = "online"
    session_id: str = Field(..., min_length=1, max_length=128)
    consented_purposes: dict[str, bool]
    language: str = Field("en", max_length=35)
    bank_customer_ref: str | None = Field(None, max_length=512)
    principal_email: str | None = Field(None, max_length=320)
    principal_phone: str | None = Field(None, max_length=32)
    identifiers: list[ConsentIdentifierInput] = Field(default_factory=list)
    staff_metadata: StaffMetadataInput | None = None
    client_captured_at: datetime | None = None
    auto_complete: bool = False


class ConsentCaptureOtpVerify(BaseModel):
    otp_code: str = Field(..., min_length=4, max_length=8)
    auto_complete: bool = True


class ConsentCaptureSessionRead(BaseModel):
    id: UUID
    client_session_id: str
    status: str
    journey_key: str
    capture_channel: str | None
    capture_mode: str
    otp_required: bool
    masked_mobile: str | None = None
    receipt_id: UUID | None = None
    proof_vault_record_id: UUID | None = None
    principal_id: UUID | None = None
    otp_verified_token: str | None = None


class ConsentCaptureSessionCompleteRead(ConsentCaptureSessionRead):
    pass


class OfflineSessionSyncItem(BaseModel):
    client_session_id: str = Field(..., min_length=1, max_length=128)
    client_captured_at: datetime
    journey_key: str = Field(..., min_length=1, max_length=64)
    capture_channel: str | None = None
    session_id: str = Field(..., min_length=1, max_length=128)
    consented_purposes: dict[str, bool]
    language: str = Field("en", max_length=35)
    bank_customer_ref: str | None = None
    principal_email: str | None = None
    principal_phone: str | None = None
    identifiers: list[ConsentIdentifierInput] = Field(default_factory=list)
    staff_metadata: StaffMetadataInput | None = None


class OfflineSessionSyncRequest(BaseModel):
    sessions: list[OfflineSessionSyncItem] = Field(..., min_length=1, max_length=100)


class OfflineSessionSyncResultItem(BaseModel):
    client_session_id: str
    success: bool
    session_id: UUID | None = None
    receipt_id: UUID | None = None
    error: str | None = None


class OfflineSessionSyncResponse(BaseModel):
    results: list[OfflineSessionSyncResultItem]
