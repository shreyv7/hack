from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class ProofVaultRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    consent_receipt_id: UUID | None = None
    block_number: int
    previous_hash: str
    current_hash: str
    merkle_leaf_hash: str
    payload_version: int = 1
    proof_hash: str | None = None
    notice_version_id: UUID | None = None
    language: str | None = None
    journey_key: str | None = None
    customer_ref_fingerprint: str | None = None
    identifier_types: list[str] | None = None
    receipt_signature: str | None = None
    event_type: str
    action: str
    purposes: str
    channel: str
    source: str
    created_at: datetime
    sealed_at: datetime
    sealed: bool
    verification_status: str


class ConsentReceiptDetailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    organization_id: UUID
    session_id: str
    consented_purposes: dict
    ip_hash: str
    user_agent: str | None = None
    language: str
    banner_snapshot: dict
    signature: str
    created_at: datetime


class ProofVaultRecordDetailRead(ProofVaultRecordRead):
    consent_receipt: ConsentReceiptDetailRead | None = None


class ProofVaultSummaryRead(BaseModel):
    total_records: int
    verified_records: int
    chain_length: int
    tampering_attempts: int
    current_merkle_root: str | None = None
    last_sealed_block: str | None = None
    last_verified_at: datetime | None = None


class ProofVaultVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    verified_at: datetime
    verified_by_user_id: UUID | None = None
    merkle_root: str
    records_checked: int
    integrity_ok: bool
    errors: str | None = None


class ProofVaultVerifyResult(BaseModel):
    success: bool
    verified_count: int
    failed_count: int
    checked_at: datetime
    errors: list[str] = Field(default_factory=list)


class ProofVaultChainVerifyResult(BaseModel):
    valid: bool
    blocks_checked: int
    invalid_blocks: int
    errors: list[str] = Field(default_factory=list)


class ProofVaultDisputePackRead(BaseModel):
    record_id: UUID
    block_number: int
    proof_hash: str | None = None
    current_hash: str
    payload_version: int
    proof_payload: dict | None = None
    payload_integrity_ok: bool
    chain_integrity_ok: bool
    notice_version_id: UUID | None = None
    language: str | None = None
    journey_key: str | None = None
    customer_ref_fingerprint: str | None = None
    identifier_types: list[str] | None = None
    receipt_signature: str | None = None
    consent_receipt_id: UUID | None = None
    receipt_created_at: datetime | None = None
    dpdpa_data_minimization: bool = True
    sealed_at: datetime


class PublicProofVerificationRead(BaseModel):
    valid: bool
    payload_version: int
    proof_hash: str | None = None
    chain_hash: str
    block_number: int
    payload_integrity_ok: bool
    chain_integrity_ok: bool
    dpdpa_data_minimization: bool = True
