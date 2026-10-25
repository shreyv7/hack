from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

AttributeLevel = Literal["required", "optional", "disabled"]


class IdentifierTypeConfig(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    storage: Literal["token", "phone", "email"] = "token"
    enabled: bool = True
    sensitive: bool = False
    allow_offline_capture: bool = True


class JourneyConfig(BaseModel):
    key: str = Field(..., min_length=1, max_length=64)
    label: str = Field(..., min_length=1, max_length=128)
    channel: str = Field(..., min_length=1, max_length=64)
    attributes: dict[str, AttributeLevel] = Field(default_factory=dict)
    otp_required: bool = False
    allow_offline_capture: bool = True
    staff_metadata_required: bool = False


class ConsentIndustryConfigRead(BaseModel):
    pack: str | None = None
    enabled: bool = False
    identifier_types: list[IdentifierTypeConfig] = []
    journeys: list[JourneyConfig] = []
    property_journey_map: dict[str, str] = Field(default_factory=dict)


class ConsentIndustryConfigUpdate(BaseModel):
    enabled: bool | None = None
    identifier_types: list[IdentifierTypeConfig] | None = None
    journeys: list[JourneyConfig] | None = None
    property_journey_map: dict[str, str] | None = None


class ConsentIdentifierInput(BaseModel):
    type: str = Field(..., min_length=1, max_length=64)
    token: str = Field(..., min_length=1, max_length=512)


class BankingConsentExtensions(BaseModel):
    journey_key: str | None = None
    capture_channel: str | None = None
    bank_customer_ref: str | None = Field(None, max_length=512)
    identifiers: list[ConsentIdentifierInput] = Field(default_factory=list)
    otp_verified_token: str | None = Field(None, max_length=512)


class ConsentPrincipalSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    canonical_ref: str
    linkage_source: str
    identifier_types: list[str] = []
    receipt_count: int = 0
    last_consent_at: datetime | None = None
    created_at: datetime


class ConsentPrincipalDetail(ConsentPrincipalSummary):
    identifiers: list[dict[str, Any]] = []
    receipts: list[dict[str, Any]] = []
