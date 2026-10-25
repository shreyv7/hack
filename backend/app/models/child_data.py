"""
Children's Data — DPDPA Section 9.

Tracks records of data principals who are minors (under 18): how they were
detected, the status of *verifiable parental consent*, and the processing
restrictions that the law requires (no profiling / no targeted advertising).

The `child_ref` is a non-identifying label (e.g. "CH_x8b3c9"), not the child's
real PII. Verifiable parental consent conceptually belongs in the Proof Vault
(see docs/MODULE_ROADMAP.md §3.5); for the MVP it is recorded inline here.
"""

import enum

from sqlalchemy import Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ChildConsentStatus(str, enum.Enum):
    missing = "missing"      # no parental consent on record
    pending = "pending"      # requested, awaiting parent
    verified = "verified"    # verifiable parental consent recorded
    expired = "expired"      # consent lapsed, needs renewal


class RestrictedPurpose(str, enum.Enum):
    """Purposes an external system asks the enforcement API about."""
    processing = "processing"        # any processing of the minor's data
    profiling = "profiling"          # behavioural tracking / profiling
    ad_targeting = "ad_targeting"    # targeted advertising


class ChildDataRecord(Base, BaseModel):
    __tablename__ = "child_data_records"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Non-identifying label for the minor's record.
    child_ref = Column(String(64), nullable=False, index=True)
    # The caller's own subject identifier (e.g. source row id), used by the
    # enforcement API to match a person the external system knows.
    external_ref = Column(String(255), nullable=True, index=True)
    date_of_birth = Column(Date, nullable=True)
    # Stored age, used when DOB is unknown (e.g. age-gate self-declaration).
    age = Column(Integer, nullable=True)
    detection_method = Column(String(64), nullable=True)  # "DOB input", "Age gate", "Aadhaar"

    consent_status = Column(
        Enum(ChildConsentStatus, name="child_consent_status"),
        nullable=False,
        default=ChildConsentStatus.missing,
    )
    parent_name = Column(String(255), nullable=True)
    parent_email = Column(String(320), nullable=True)
    parent_relationship = Column(String(64), nullable=True)  # "Father", "Guardian"
    consent_verification_method = Column(String(64), nullable=True)  # "DigiLocker", "Video"
    consent_verified_at = Column(DateTime(timezone=True), nullable=True)
    consent_expires_at = Column(DateTime(timezone=True), nullable=True)

    # Parent self-service consent request (emailed link). The token is the secret
    # in the link; it is one-time (cleared once the parent responds).
    consent_token = Column(String(64), nullable=True, index=True)
    consent_requested_at = Column(DateTime(timezone=True), nullable=True)
    consent_request_expires_at = Column(DateTime(timezone=True), nullable=True)
    # Audit evidence of the parent's decision (method, IP, user-agent, statement).
    consent_evidence = Column(JSON, nullable=True)

    # DPDPA Section 9: profiling and targeted advertising are blocked by default.
    profiling_blocked = Column(Boolean, nullable=False, server_default="true")
    ad_targeting_blocked = Column(Boolean, nullable=False, server_default="true")

    notes = Column(Text, nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    # Set when the subject turns 18: restrictions are lifted and the record is
    # retained for audit but no longer treated as an active minor.
    aged_out_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="child_data_records")
