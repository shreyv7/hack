"""Proof Vault: cryptographically verifiable consent receipts."""

from sqlalchemy import Column, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ConsentReceipt(Base, BaseModel):
    __tablename__ = "consent_receipts"
    
    # Using JSONB to support indexing later if needed, JSON from SQLAlchemy core usually maps to JSON. We use postgresql dialect JSONB
    
    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    
    session_id = Column(String(128), nullable=False, index=True)
    consented_purposes = Column(JSONB, nullable=False)
    basis_type = Column(String(32), nullable=True)
    
    # Client Context
    ip_hash = Column(String(64), nullable=False)
    user_agent = Column(String(1024))
    language = Column(String(10), nullable=False, default="en")
    principal_email = Column(String(320), nullable=True)
    portal_email_sent_at = Column(DateTime(timezone=True), nullable=True)
    portal_email_status = Column(String(32), nullable=True)
    principal_phone = Column(String(32), nullable=True)
    portal_sms_sent_at = Column(DateTime(timezone=True), nullable=True)
    portal_sms_status = Column(String(32), nullable=True)

    # Banking industry pack (cross-channel linkage)
    capture_channel = Column(String(64), nullable=True, index=True)
    journey_key = Column(String(64), nullable=True, index=True)
    principal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_principals.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    bank_customer_ref = Column(String(512), nullable=True, index=True)
    identifier_snapshot = Column(JSONB, nullable=True)
    notice_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notice_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    proof_vault_record_id = Column(
        UUID(as_uuid=True),
        ForeignKey("proof_vault_records.id", ondelete="SET NULL"),
        nullable=True,
    )
    proof_seal_status = Column(String(32), nullable=True)
    assisted_capture_metadata = Column(JSONB, nullable=True)
    expiry_webhook_sent_at = Column(DateTime(timezone=True), nullable=True)

    # Audit snapshots
    banner_snapshot = Column(JSONB, nullable=False)
    signature = Column(String(64), nullable=False)

    # Relationships
    property = relationship("IntegrationProperty", backref="consent_receipts")
    organization = relationship("Organization")
    principal = relationship("ConsentPrincipal", back_populates="receipts")
