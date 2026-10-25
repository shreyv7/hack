from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Boolean, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import BaseModel


class ProofVaultRecord(Base, BaseModel):
    __tablename__ = "proof_vault_records"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    consent_receipt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    block_number = Column(Integer, nullable=False)
    previous_hash = Column(String(64), nullable=False)
    current_hash = Column(String(64), nullable=False, index=True)
    merkle_leaf_hash = Column(String(64), nullable=False)

    # v2 DPDPA-compliant proof payload (fingerprints only — no raw PII)
    payload_version = Column(Integer, nullable=False, default=1)
    proof_hash = Column(String(64), nullable=True, index=True)
    proof_payload_json = Column(JSONB, nullable=True)
    notice_version_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    language = Column(String(10), nullable=True)
    journey_key = Column(String(64), nullable=True)
    customer_ref_fingerprint = Column(String(64), nullable=True, index=True)
    identifier_types = Column(JSONB, nullable=True)
    receipt_signature = Column(String(64), nullable=True)
    
    event_type = Column(String(64), nullable=False)
    action = Column(String(64), nullable=False)
    purposes = Column(Text, nullable=False)
    channel = Column(String(128), nullable=False)
    source = Column(String(256), nullable=False)
    
    created_at = Column(DateTime(timezone=True), nullable=False)
    sealed_at = Column(DateTime(timezone=True), nullable=False)
    sealed = Column(Boolean, nullable=False, default=True)
    verification_status = Column(String(32), nullable=False, default="verified")

    organization = relationship("Organization")
    consent_receipt = relationship("ConsentReceipt", foreign_keys=[consent_receipt_id])


class ProofVaultVerification(Base, BaseModel):
    __tablename__ = "proof_vault_verifications"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    verified_at = Column(DateTime(timezone=True), nullable=False)
    verified_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    merkle_root = Column(String(64), nullable=False)
    records_checked = Column(Integer, nullable=False, default=0)
    integrity_ok = Column(Boolean, nullable=False, default=True)
    errors = Column(Text, nullable=True)

    organization = relationship("Organization")
