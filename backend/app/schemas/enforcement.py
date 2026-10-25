"""Pydantic schemas for consent enforcement APIs."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enforcement import DenyBehavior, EnforcementMode, RemediationTaskStatus, WithdrawalAction


class ConsentDecisionRequest(BaseModel):
    purpose_key: str = Field(..., max_length=128, description="Purpose UUID or stable purpose name")
    principal_email: EmailStr | None = None
    principal_phone: str | None = Field(None, max_length=32)
    session_id: str | None = Field(None, max_length=128)
    collection_point: str | None = Field(None, max_length=255)


class PurposeDecisionDetail(BaseModel):
    allowed: bool
    legal_basis: str
    effective_mode: EnforcementMode
    reason: str
    decision: str
    receipt_id: UUID | None = None


class ConsentDecisionResponse(BaseModel):
    allowed: bool
    purpose_id: UUID
    purpose_name: str
    legal_basis: str
    effective_mode: EnforcementMode
    deny_behavior: DenyBehavior | None = None
    decision: str
    receipt_id: UUID | None = None
    principal_fingerprint: str
    decision_token: str | None = None
    decision_token_expires_in: int | None = None
    evaluated_at: datetime
    source: str = "api"


class DecisionTokenMintRequest(BaseModel):
    principal_email: EmailStr | None = None
    principal_phone: str | None = Field(None, max_length=32)
    session_id: str | None = Field(None, max_length=128)


class DecisionTokenResponse(BaseModel):
    decision_token: str
    decision_token_expires_in: int
    principal_fingerprint: str
    decisions: dict[str, PurposeDecisionDetail]


class DecisionTokenVerifyRequest(BaseModel):
    token: str
    purpose_key: str | None = Field(None, max_length=128)
    principal_fingerprint: str | None = Field(None, max_length=64)


class DecisionTokenVerifyResponse(BaseModel):
    valid: bool
    allowed: bool | None = None
    purpose_key: str | None = None
    principal_fingerprint: str | None = None
    effective_mode: EnforcementMode | None = None
    decision: str | None = None
    reason: str | None = None
    expires_in: int | None = None
    decisions: dict[str, PurposeDecisionDetail] | None = None


class PropertySigningSecretRead(BaseModel):
    property_id: UUID
    signing_secret: str
    token_ttl_seconds: int


class PurposeEnforcementConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    purpose_id: UUID
    mode: EnforcementMode
    deny_behavior: DenyBehavior
    updated_by_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class PurposeEnforcementConfigUpsert(BaseModel):
    purpose_id: UUID
    mode: EnforcementMode = EnforcementMode.disabled
    deny_behavior: DenyBehavior = DenyBehavior.reject


class PropertyEnforcementRead(BaseModel):
    property_id: UUID
    enforcement_mode: EnforcementMode
    has_decision_signing_secret: bool


class PropertyEnforcementUpdate(BaseModel):
    enforcement_mode: EnforcementMode


class EnforcementEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID | None
    purpose_id: UUID | None
    principal_fingerprint: str
    decision: str
    legal_basis: str
    effective_mode: str
    receipt_id: UUID | None
    collection_point: str | None
    latency_ms: int | None
    occurred_at: datetime


class PurposeDataMappingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    purpose_id: UUID
    inventory_field_id: UUID
    withdrawal_action: WithdrawalAction
    created_at: datetime
    updated_at: datetime


class PurposeDataMappingUpsert(BaseModel):
    purpose_id: UUID
    inventory_field_id: UUID
    withdrawal_action: WithdrawalAction = WithdrawalAction.suppress


class WithdrawalRemediationTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    purpose_id: UUID
    inventory_field_id: UUID
    principal_id: UUID
    property_id: UUID | None
    receipt_id: UUID | None
    mapping_id: UUID | None
    action: WithdrawalAction
    status: RemediationTaskStatus
    sla_due_at: datetime
    completed_at: datetime | None
    notes: str | None
    proof_vault_record_id: UUID | None
    created_at: datetime
    updated_at: datetime


class WithdrawalRemediationSummary(BaseModel):
    pending_tasks: int
    overdue_tasks: int
    obligations_from_withdrawal: int


class SuppressionCheckIdentifier(BaseModel):
    ref: str | None = Field(None, max_length=128, description="Client-side reference for this row")
    principal_email: EmailStr | None = None
    principal_phone: str | None = Field(None, max_length=32)


class SuppressionCheckRequest(BaseModel):
    purpose_key: str = Field(..., max_length=128)
    identifiers: list[SuppressionCheckIdentifier] = Field(..., min_length=1, max_length=500)


class SuppressionCheckResult(BaseModel):
    ref: str | None = None
    principal_fingerprint: str
    allowed: bool
    decision: str


class SuppressionCheckResponse(BaseModel):
    purpose_key: str
    purpose_id: UUID
    purpose_name: str
    results: list[SuppressionCheckResult]
