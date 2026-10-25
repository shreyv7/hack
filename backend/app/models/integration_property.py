"""Integration property — a website/domain registered for consent management."""

import enum

from sqlalchemy import Boolean, Column, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel
from app.models.enforcement import EnforcementMode


class PropertyStatus(str, enum.Enum):
    pending_setup = "pending_setup"
    active = "active"
    paused = "paused"
    archived = "archived"
    verification_failed = "verification_failed"


class PropertyType(str, enum.Enum):
    website = "website"
    android = "android"
    ios = "ios"
    tag_manager = "tag_manager"
    server = "server"
    api = "api"


class PropertyEnvironment(str, enum.Enum):
    production = "production"
    staging = "staging"
    development = "development"


class BlockerMode(str, enum.Enum):
    strict = "strict"
    standard = "standard"
    off = "off"


class IntegrationProperty(Base, BaseModel):
    __tablename__ = "integration_properties"
    __table_args__ = (
        UniqueConstraint("organization_id", "domain", "environment", name="uq_property_org_domain_env"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Domain identification
    domain = Column(String(255), nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    property_type = Column(
        Enum(PropertyType, name="property_type"),
        nullable=False,
        default=PropertyType.website,
    )
    environment = Column(
        Enum(PropertyEnvironment, name="property_environment"),
        nullable=False,
        default=PropertyEnvironment.production,
    )

    # Status
    status = Column(
        Enum(PropertyStatus, name="property_status"),
        nullable=False,
        default=PropertyStatus.pending_setup,
    )

    # Configuration
    blocker_mode = Column(
        Enum(BlockerMode, name="blocker_mode"),
        nullable=False,
        default=BlockerMode.strict,
    )
    auto_language = Column(Boolean, nullable=False, default=True)
    default_language = Column(String(10), nullable=False, default="en")
    geo_targeting = Column(JSON, nullable=False, server_default="{}")
    settings = Column(JSON, nullable=False, server_default="{}")
    allowed_origins = Column(JSON, nullable=False, server_default="[]")

    # Consent enforcement (first-party writes)
    decision_signing_secret_encrypted = Column(String(512), nullable=True)
    enforcement_mode = Column(
        Enum(EnforcementMode, name="property_enforcement_mode"),
        nullable=False,
        default=EnforcementMode.disabled,
        server_default="disabled",
    )

    # Creator
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Consent Notice Association
    consent_notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    organization = relationship("Organization", backref="integration_properties")
    consent_notice = relationship("ConsentNotice", backref="properties")
    api_keys = relationship(
        "IntegrationApiKey",
        back_populates="property",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    banner_associations = relationship(
        "PropertyBannerAssociation",
        back_populates="property",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
