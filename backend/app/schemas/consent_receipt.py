from datetime import datetime
from uuid import UUID

from typing import Any
from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.schemas.consent_banking import BankingConsentExtensions, ConsentIdentifierInput


class ConsentReceiptCreate(BankingConsentExtensions):
    session_id: str = Field(..., max_length=128)
    consented_purposes: dict[str, bool]
    language: str = Field("en", max_length=35)
    principal_email: EmailStr | None = None
    principal_phone: str | None = Field(None, max_length=32)

    @model_validator(mode="before")
    @classmethod
    def strip_metadata_keys(cls, data: Any) -> Any:
        if isinstance(data, dict):
            purposes = data.get("consented_purposes")
            if isinstance(purposes, dict):
                # Filter out any keys starting with underscore (like _expires_at)
                data["consented_purposes"] = {
                    k: v for k, v in purposes.items() if not k.startswith("_")
                }
        return data


class ConsentReceiptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    organization_id: UUID
    session_id: str
    consented_purposes: dict[str, bool]
    language: str
    created_at: datetime
    capture_channel: str | None = None
    journey_key: str | None = None
    principal_id: UUID | None = None
    proof_vault_record_id: UUID | None = None
    proof_seal_status: str | None = None
    assisted_capture_metadata: dict[str, Any] | None = None
    decision_token: str | None = None
    decision_token_expires_in: int | None = None


class ConsentReceiptDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    property_domain: str | None = None
    organization_id: UUID
    session_id: str
    consented_purposes: dict[str, bool]
    language: str
    principal_email: str | None = None
    principal_phone: str | None = None
    portal_sms_sent_at: datetime | None = None
    portal_sms_status: str | None = None
    capture_channel: str | None = None
    journey_key: str | None = None
    bank_customer_ref: str | None = None
    principal_id: UUID | None = None
    identifier_snapshot: list[dict[str, Any]] | None = None
    proof_vault_record_id: UUID | None = None
    proof_seal_status: str | None = None
    assisted_capture_metadata: dict[str, Any] | None = None
    created_at: datetime
    ip_hash: str
    user_agent: str | None = None


class ConsentReceiptPaginatedRead(BaseModel):
    total: int
    page: int
    limit: int
    items: list[ConsentReceiptDetail]
