import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class PolicyType(str, enum.Enum):
    privacy = "privacy"
    cookie = "cookie"
    children = "children"
    employee = "employee"
    vendor = "vendor"
    aup = "aup"
    retention = "retention"
    incident = "incident"
    custom = "custom"


class PolicyVersionStatus(str, enum.Enum):
    draft = "draft"
    review = "review"
    approved = "approved"
    live = "live"
    archived = "archived"


class AcknowledgementStatus(str, enum.Enum):
    pending = "pending"
    sent = "sent"
    acknowledged = "acknowledged"
    overdue = "overdue"


class PolicyDocument(Base, BaseModel):
    __tablename__ = "policy_documents"

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
    title = Column(String(255), nullable=False)
    policy_type = Column(
        Enum(PolicyType, name="policy_type"),
        nullable=False,
    )
    current_live_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("policy_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    archived_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="policies")
    versions = relationship(
        "PolicyVersion",
        back_populates="policy",
        foreign_keys="PolicyVersion.policy_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    current_live_version = relationship(
        "PolicyVersion",
        foreign_keys=[current_live_version_id],
        post_update=True,
    )

    @property
    def version_label(self) -> str:
        if self.current_live_version:
            return f"v{self.current_live_version.version_number}.0"
        return "Draft"


class PolicyVersion(Base, BaseModel):
    __tablename__ = "policy_versions"
    __table_args__ = (
        UniqueConstraint("policy_id", "version_number", name="uq_policy_version_number"),
    )

    policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("policy_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(
        Enum(PolicyVersionStatus, name="policy_version_status"),
        nullable=False,
        default=PolicyVersionStatus.draft,
    )
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    effective_date = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    policy = relationship(
        "PolicyDocument",
        back_populates="versions",
        foreign_keys=[policy_id],
    )
    published_by = relationship("User", foreign_keys=[published_by_user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_user_id])


class PolicyAcknowledgement(Base, BaseModel):
    __tablename__ = "policy_acknowledgements"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("policy_documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("policy_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    audience = Column(String(100), nullable=False)
    recipient_id = Column(String(255), nullable=False, index=True)
    recipient_name = Column(String(255), nullable=False)
    recipient_email = Column(String(255), nullable=True)
    status = Column(
        Enum(AcknowledgementStatus, name="acknowledgement_status"),
        nullable=False,
        default=AcknowledgementStatus.pending,
    )
    sent_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    reminder_count = Column(Integer, nullable=False, default=0)
    last_reminder_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    policy = relationship("PolicyDocument")
    policy_version = relationship("PolicyVersion")


class PolicyActivity(Base, BaseModel):
    __tablename__ = "policy_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("policy_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False)
    policy_title = Column(String(255), nullable=False)
    policy_version = Column(String(50), nullable=False)
    user_name = Column(String(255), nullable=False)

    organization = relationship("Organization")
    policy = relationship("PolicyDocument")
