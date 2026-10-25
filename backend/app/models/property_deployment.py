"""Property Deployment models — supporting Web, iOS, Android, and other deployment targets."""

import enum
from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Enum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DeploymentPlatform(str, enum.Enum):
    website = "website"
    android = "android"
    ios = "ios"
    flutter = "flutter"
    react_native = "react_native"
    tag_manager = "tag_manager"
    server = "server"
    api = "api"


class DeploymentStatus(str, enum.Enum):
    created = "created"
    configured = "configured"
    verified = "verified"
    published = "published"
    deprecated = "deprecated"
    archived = "archived"


class PropertyDeployment(Base, BaseModel):
    __tablename__ = "property_deployments"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    platform = Column(
        Enum(DeploymentPlatform, name="deployment_platform"),
        nullable=False,
        default=DeploymentPlatform.website,
    )
    identifier = Column(String(255), nullable=False, index=True)  # bundle_id / package_name / url
    status = Column(
        Enum(DeploymentStatus, name="deployment_status"),
        nullable=False,
        default=DeploymentStatus.created,
    )

    active_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "deployment_configuration_versions.id",
            ondelete="SET NULL",
            use_alter=True,
            name="fk_pd_active_version_id",
        ),
        nullable=True,
    )

    # Relationships
    property = relationship("IntegrationProperty")
    active_version = relationship(
        "DeploymentConfigurationVersion",
        foreign_keys=[active_version_id],
        post_update=True,
    )
    versions = relationship(
        "DeploymentConfigurationVersion",
        back_populates="deployment",
        cascade="all, delete-orphan",
        foreign_keys="[DeploymentConfigurationVersion.deployment_id]",
    )
    heartbeats = relationship(
        "DeploymentHeartbeat",
        back_populates="deployment",
        cascade="all, delete-orphan",
    )


class DeploymentConfigurationVersion(Base, BaseModel):
    __tablename__ = "deployment_configuration_versions"

    deployment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("property_deployments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(String(20), nullable=False, default="draft")  # draft | published | archived
    settings = Column(JSONB, nullable=False, server_default="{}")
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    deployment = relationship(
        "PropertyDeployment",
        back_populates="versions",
        foreign_keys=[deployment_id],
    )


class DeploymentHeartbeat(Base, BaseModel):
    __tablename__ = "deployment_heartbeats"

    deployment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("property_deployments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sdk_version = Column(String(50), nullable=False)
    os_version = Column(String(50), nullable=True)
    device_model = Column(String(100), nullable=True)
    status = Column(String(50), nullable=False, default="online")
    received_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    deployment = relationship("PropertyDeployment", back_populates="heartbeats")
