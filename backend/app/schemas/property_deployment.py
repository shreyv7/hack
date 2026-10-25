"""Property Deployment schemas — for validating and serializing deployment targets, configurations, and pings."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.property_deployment import DeploymentPlatform, DeploymentStatus


class DeploymentConfigurationVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deployment_id: UUID
    version_number: int
    status: str
    settings: dict
    created_at: datetime
    created_by: UUID | None = None


class PropertyDeploymentCreate(BaseModel):
    name: str = Field(..., max_length=255)
    platform: DeploymentPlatform
    identifier: str = Field(..., max_length=255)
    settings: dict = Field(default_factory=dict)


class PropertyDeploymentUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    identifier: str | None = Field(None, max_length=255)
    status: DeploymentStatus | None = None
    settings: dict | None = None


class PropertyDeploymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    name: str
    platform: DeploymentPlatform
    identifier: str
    status: DeploymentStatus
    active_version_id: UUID | None = None
    active_version: DeploymentConfigurationVersionRead | None = None
    created_at: datetime
    updated_at: datetime


class DeploymentHeartbeatCreate(BaseModel):
    sdk_version: str = Field(..., max_length=50)
    os_version: str | None = Field(None, max_length=50)
    device_model: str | None = Field(None, max_length=100)


class DeploymentHeartbeatRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    deployment_id: UUID
    sdk_version: str
    os_version: str | None
    device_model: str | None
    status: str
    received_at: datetime
