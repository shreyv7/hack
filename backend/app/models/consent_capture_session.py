"""Staged consent capture sessions for assisted banking flows with OTP verification."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ConsentCaptureSessionStatus(str, enum.Enum):
    draft = "draft"
    otp_pending = "otp_pending"
    verified = "verified"
    completed = "completed"
    expired = "expired"
    failed = "failed"


class ConsentCaptureMode(str, enum.Enum):
    online = "online"
    offline = "offline"


class ConsentCaptureSession(Base, BaseModel):
    __tablename__ = "consent_capture_sessions"
    __table_args__ = (
        UniqueConstraint(
            "property_id",
            "client_session_id",
            name="uq_consent_capture_session_property_client",
        ),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_session_id = Column(String(128), nullable=False, index=True)
    journey_key = Column(String(64), nullable=False)
    capture_channel = Column(String(64), nullable=True)
    status = Column(
        Enum(ConsentCaptureSessionStatus, name="consent_capture_session_status"),
        nullable=False,
        default=ConsentCaptureSessionStatus.draft,
    )
    capture_mode = Column(
        Enum(ConsentCaptureMode, name="consent_capture_mode"),
        nullable=False,
        default=ConsentCaptureMode.online,
    )
    payload_json = Column(JSONB, nullable=False)
    staff_metadata_json = Column(JSONB, nullable=True)
    mobile_e164 = Column(String(32), nullable=True)
    otp_code_hash = Column(String(128), nullable=True)
    otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    otp_attempts = Column(Integer, nullable=False, default=0)
    otp_sent_count = Column(Integer, nullable=False, default=0)
    last_otp_sent_at = Column(DateTime(timezone=True), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    consent_receipt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    client_captured_at = Column(DateTime(timezone=True), nullable=True)
    synced_at = Column(DateTime(timezone=True), nullable=True)
    otp_verified_token = Column(String(512), nullable=True)

    organization = relationship("Organization")
    property = relationship("IntegrationProperty")
    consent_receipt = relationship("ConsentReceipt", foreign_keys=[consent_receipt_id])
