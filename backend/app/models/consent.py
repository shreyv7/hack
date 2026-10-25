import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class LegalBasis(str, enum.Enum):
    consent = "consent"
    legitimate_use = "legitimate_use"


class NoticeVersionStatus(str, enum.Enum):
    draft = "draft"
    pending_legal = "pending_legal"
    pending_dpo = "pending_dpo"
    dpo_approved = "dpo_approved"
    live = "live"
    archived = "archived"


class PurposeVersionStatus(str, enum.Enum):
    draft = "draft"
    live = "live"
    archived = "archived"


notice_version_purposes = Table(
    "notice_version_purposes",
    Base.metadata,
    Column(
        "notice_version_id",
        UUID(as_uuid=True),
        ForeignKey("consent_notice_versions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "purpose_version_id",
        UUID(as_uuid=True),
        ForeignKey("purpose_versions.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column("sort_order", Integer, nullable=False, default=0),
)


class Purpose(Base, BaseModel):
    __tablename__ = "purposes"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    current_live_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purpose_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    archived_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="purposes")
    versions = relationship(
        "PurposeVersion",
        back_populates="purpose",
        foreign_keys="PurposeVersion.purpose_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    current_live_version = relationship(
        "PurposeVersion",
        foreign_keys=[current_live_version_id],
        post_update=True,
    )

    @property
    def version(self) -> str:
        if self.current_live_version:
            return f"v{self.current_live_version.version_number}.0"
        return "v1.0"

    @property
    def legal_basis(self) -> LegalBasis:
        return self.current_live_version.legal_basis if self.current_live_version else LegalBasis.consent

    @property
    def lia_summary(self) -> str | None:
        return self.current_live_version.lia_summary if self.current_live_version else None

    @property
    def lia_reviewed_at(self) -> datetime | None:
        return self.current_live_version.lia_reviewed_at if self.current_live_version else None

    @property
    def lia_reviewed_by(self) -> str | None:
        return self.current_live_version.lia_reviewed_by if self.current_live_version else None

    @property
    def data_categories(self) -> list[str]:
        return self.current_live_version.data_categories if self.current_live_version else []

    @property
    def retention_period(self) -> str:
        return self.current_live_version.retention_period if self.current_live_version else ""

    @property
    def description(self) -> str | None:
        return self.current_live_version.description if self.current_live_version else None

    @property
    def is_special_category(self) -> bool:
        return self.current_live_version.is_special_category if self.current_live_version else False

    @property
    def last_reviewed_at(self) -> datetime | None:
        return self.current_live_version.last_reviewed_at if self.current_live_version else None


class PurposeVersion(Base, BaseModel):
    __tablename__ = "purpose_versions"
    __table_args__ = (
        UniqueConstraint("purpose_id", "version_number", name="uq_purpose_version_number"),
    )

    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(
        Enum(PurposeVersionStatus, name="purpose_version_status"),
        nullable=False,
        default=PurposeVersionStatus.live,
    )
    name = Column(String(255), nullable=False)
    legal_basis = Column(
        Enum(LegalBasis, name="legal_basis"),
        nullable=False,
        default=LegalBasis.consent,
    )
    data_categories = Column(JSON, nullable=False, server_default="[]")
    retention_period = Column(String(255), nullable=False, default="")
    description = Column(Text, nullable=True)
    is_special_category = Column(Boolean, nullable=False, server_default="false")
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    translations = Column(JSON, nullable=True, server_default='{}')
    lia_summary = Column(Text, nullable=True)
    lia_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    lia_reviewed_by = Column(String(255), nullable=True)

    purpose = relationship(
        "Purpose",
        back_populates="versions",
        foreign_keys=[purpose_id],
    )
    notice_versions = relationship(
        "ConsentNoticeVersion",
        secondary=notice_version_purposes,
        back_populates="purposes",
    )

    @property
    def version(self) -> str:
        return f"v{self.version_number}.0"
    
    @property
    def archived_at(self) -> datetime | None:
        return None


class ConsentNotice(Base, BaseModel):
    __tablename__ = "consent_notices"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    internal_name = Column(String(255), nullable=False)
    current_live_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notice_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    archived_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="consent_notices")
    versions = relationship(
        "ConsentNoticeVersion",
        back_populates="notice",
        foreign_keys="ConsentNoticeVersion.notice_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    current_live_version = relationship(
        "ConsentNoticeVersion",
        foreign_keys=[current_live_version_id],
        post_update=True,
    )


class ConsentNoticeVersion(Base, BaseModel):
    __tablename__ = "consent_notice_versions"
    __table_args__ = (
        UniqueConstraint("notice_id", "version_number", name="uq_notice_version_number"),
    )

    notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(
        Enum(NoticeVersionStatus, name="notice_version_status"),
        nullable=False,
        default=NoticeVersionStatus.draft,
    )
    display_name = Column(String(255), nullable=False, default="")
    language = Column(String(64), nullable=False, default="English")
    opening_statement = Column(Text, nullable=False, default="")
    contact_email = Column(String(320), nullable=True)
    contact_website = Column(String(2048), nullable=True)
    dpo_name = Column(String(255), nullable=True)
    dpo_email = Column(String(320), nullable=True)
    rights_exercise = Column(Text, nullable=False, default="")
    complaint_process = Column(Text, nullable=False, default="")
    retention_policy = Column(Text, nullable=False, default="")
    compliance_warnings = Column(JSON, nullable=False, server_default="[]")
    translations = Column(JSON, nullable=True, server_default='{}')
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    legal_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    legal_reviewed_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    dpo_approved_at = Column(DateTime(timezone=True), nullable=True)
    dpo_approved_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approval_notes = Column(JSON, nullable=True)

    notice = relationship(
        "ConsentNotice",
        back_populates="versions",
        foreign_keys=[notice_id],
    )
    purposes = relationship(
        "PurposeVersion",
        secondary=notice_version_purposes,
        back_populates="notice_versions",
    )
    published_by = relationship("User", foreign_keys=[published_by_user_id])


class NoticeActivity(Base, BaseModel):
    __tablename__ = "notice_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False)
    notice_name = Column(String(255), nullable=False)
    notice_version = Column(String(50), nullable=False)
    user_name = Column(String(255), nullable=False)

    organization = relationship("Organization")
    notice = relationship("ConsentNotice")


class PurposeActivity(Base, BaseModel):
    __tablename__ = "purpose_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False)
    purpose_name = Column(String(255), nullable=False)
    purpose_version = Column(String(50), nullable=False)
    user_name = Column(String(255), nullable=False)

    organization = relationship("Organization")
    purpose = relationship("Purpose")

