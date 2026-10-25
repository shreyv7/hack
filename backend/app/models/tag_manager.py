from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Date
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class TagManagerContainer(Base, BaseModel):
    __tablename__ = "tag_manager_containers"

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
    provider = Column(String(100), nullable=False) # Google Tag Manager, Adobe Launch, Tealium, Custom
    container_name = Column(String(255), nullable=False)
    container_identifier = Column(String(100), nullable=False) # e.g. GTM-XXXX
    environment = Column(String(50), nullable=False, default="production")
    status = Column(String(50), nullable=False, default="active") # active, inactive
    auto_sync = Column(Boolean, nullable=False, default=True)
    consent_mode = Column(Boolean, nullable=False, default=True)

    organization = relationship("Organization")
    property = relationship("IntegrationProperty")
    tags = relationship("ManagedTag", back_populates="container", cascade="all, delete-orphan")


class ManagedTag(Base, BaseModel):
    __tablename__ = "managed_tags"

    container_id = Column(
        UUID(as_uuid=True),
        ForeignKey("tag_manager_containers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider = Column(String(100), nullable=False)
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    tag_name = Column(String(255), nullable=False)
    trigger = Column(String(255), nullable=False)
    execution_type = Column(String(100), nullable=False) # External Script, Inline, Pixel, HTML, Custom
    script_url = Column(String(1000), nullable=True)
    inline_script = Column(String(10000), nullable=True)
    status = Column(String(50), nullable=False, default="active") # active, inactive
    priority = Column(Integer, nullable=False, default=10)

    container = relationship("TagManagerContainer", back_populates="tags")
    property = relationship("IntegrationProperty")
    purpose = relationship("Purpose")


class TagExecutionRule(Base, BaseModel):
    __tablename__ = "tag_execution_rules"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    priority = Column(Integer, nullable=False, default=10)
    rule_json = Column(JSONB, nullable=False)
    status = Column(String(50), nullable=False, default="active") # active, inactive

    property = relationship("IntegrationProperty")


class TagViolation(Base, BaseModel):
    __tablename__ = "tag_violations"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tag_id = Column(
        UUID(as_uuid=True),
        ForeignKey("managed_tags.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    page = Column(String(2000), nullable=False)
    severity = Column(String(50), nullable=False) # High, Medium, Low
    reason = Column(String(500), nullable=False)
    resolved = Column(Boolean, nullable=False, default=False)
    resolved_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    property = relationship("IntegrationProperty")
    tag = relationship("ManagedTag")
    resolver = relationship("User")


class TagManagerDailyMetric(Base, BaseModel):
    __tablename__ = "tag_manager_daily_metrics"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    executed = Column(Integer, nullable=False, default=0)
    blocked = Column(Integer, nullable=False, default=0)
    analytics = Column(Integer, nullable=False, default=0)
    marketing = Column(Integer, nullable=False, default=0)
    functional = Column(Integer, nullable=False, default=0)
    necessary = Column(Integer, nullable=False, default=0)

    property = relationship("IntegrationProperty")


class TagExecutionLog(Base, BaseModel):
    __tablename__ = "tag_execution_logs"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tag_id = Column(
        UUID(as_uuid=True),
        ForeignKey("managed_tags.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    executed = Column(Integer, nullable=False, default=0)
    blocked = Column(Integer, nullable=False, default=0)
    purpose_name = Column(String(100), nullable=False, default="")

    property = relationship("IntegrationProperty")
    tag = relationship("ManagedTag")


class TagManagerSettings(Base, BaseModel):
    __tablename__ = "tag_manager_settings"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    consent_mode_v2 = Column(Boolean, nullable=False, default=True)
    auto_blocker_strict = Column(Boolean, nullable=False, default=True)
    datalayer_event_prefix = Column(String(50), nullable=False, default="zeroshield")
    blocked_purposes = Column(JSONB, nullable=False, server_default="[]")
    updated_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    property = relationship("IntegrationProperty")
    updater = relationship("User")
