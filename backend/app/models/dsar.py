import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DataRightType(str, enum.Enum):
    access = "access"
    correction = "correction"
    erasure = "erasure"
    nomination = "nomination"
    grievance = "grievance"
    withdraw_consent = "withdraw_consent"
    objection = "objection"
    masking = "masking"
    anonymization = "anonymization"


class VerificationStatus(str, enum.Enum):
    unverified = "unverified"
    verified = "verified"


class DataRightsRequestStatus(str, enum.Enum):
    pending_verification = "pending_verification"
    received = "received"
    in_review = "in_review"
    response_ready = "response_ready"
    completed = "completed"
    rejected = "rejected"


class DataRightsActivityAction(str, enum.Enum):
    request_created = "request_created"
    identity_verified = "identity_verified"
    status_changed = "status_changed"
    assigned = "assigned"
    unassigned = "unassigned"
    grievance_acknowledged = "grievance_acknowledged"
    resolved = "resolved"
    comment_added = "comment_added"


class ReminderType(str, enum.Enum):
    due_7d = "due_7d"
    due_3d = "due_3d"
    due_1d = "due_1d"
    overdue = "overdue"
    ack_due = "ack_due"
    ack_overdue = "ack_overdue"


class DataRightsRequest(Base, BaseModel):
    __tablename__ = "data_rights_requests"
    __table_args__ = (UniqueConstraint("tracking_id", name="uq_data_rights_requests_tracking_id"),)

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
    tracking_id = Column(String(32), nullable=False, index=True)
    right_type = Column(
        Enum(DataRightType, name="data_right_type"),
        nullable=False,
    )
    requester_name = Column(String(255), nullable=False)
    requester_email = Column(String(320), nullable=True, index=True)
    requester_phone = Column(String(32), nullable=True)
    request_details = Column(Text, nullable=False, default="")
    extra_data = Column(JSON, nullable=False, server_default="{}")

    verification_method = Column(String(32), nullable=False, default="email")
    verification_status = Column(
        Enum(VerificationStatus, name="verification_status"),
        nullable=False,
        default=VerificationStatus.unverified,
    )
    otp_code_hash = Column(String(128), nullable=True)
    otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    otp_attempts = Column(Integer, nullable=False, server_default="0")
    otp_sent_count = Column(Integer, nullable=False, server_default="0")
    last_otp_sent_at = Column(DateTime(timezone=True), nullable=True)

    status = Column(
        Enum(DataRightsRequestStatus, name="data_rights_request_status"),
        nullable=False,
        default=DataRightsRequestStatus.pending_verification,
    )
    received_at = Column(DateTime(timezone=True), nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    breached_at = Column(DateTime(timezone=True), nullable=True)
    ack_due_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    ack_breached_at = Column(DateTime(timezone=True), nullable=True)
    assigned_to_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requires_legal_signoff = Column(Boolean, nullable=False, default=False, server_default="false")
    legal_signed_off_by_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    closure_text = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    fulfillment_metadata = Column(JSON, nullable=True)
    retention_hold_applied = Column(Boolean, nullable=False, default=False, server_default="false")

    organization = relationship("Organization", back_populates="data_rights_requests")
    reminder_events = relationship(
        "DataRightsReminderEvent",
        back_populates="request",
        cascade="all, delete-orphan",
    )
    activity_events = relationship(
        "DataRightsActivityEvent",
        back_populates="request",
        cascade="all, delete-orphan",
    )


class DataRightsActivityEvent(Base, BaseModel):
    __tablename__ = "data_rights_activity_events"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_rights_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tracking_id = Column(String(32), nullable=False, index=True)
    right_type = Column(Enum(DataRightType, name="data_right_type"), nullable=False)
    action = Column(
        Enum(DataRightsActivityAction, name="data_rights_activity_action"),
        nullable=False,
    )
    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    actor_name = Column(String(255), nullable=False, default="")
    assignee_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assignee_name = Column(String(255), nullable=True)
    message = Column(Text, nullable=False, default="")
    event_metadata = Column(JSON, nullable=False, server_default="{}")

    request = relationship("DataRightsRequest", back_populates="activity_events")


class DataRightsReminderEvent(Base, BaseModel):
    __tablename__ = "data_rights_reminder_events"
    __table_args__ = (
        UniqueConstraint("request_id", "reminder_type", name="uq_dsar_reminder_request_type"),
    )

    request_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_rights_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reminder_type = Column(
        Enum(ReminderType, name="dsar_reminder_type"),
        nullable=False,
    )
    reminded_at = Column(DateTime(timezone=True), nullable=False)
    email_sent = Column(Boolean, nullable=False, server_default="false")

    request = relationship("DataRightsRequest", back_populates="reminder_events")
