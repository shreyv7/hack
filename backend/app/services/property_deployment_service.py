"""DeploymentService for managing property deployments, configuration versions, and heartbeats."""

from datetime import datetime, timezone
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.property_deployment import (
    PropertyDeployment,
    DeploymentConfigurationVersion,
    DeploymentHeartbeat,
    DeploymentPlatform,
    DeploymentStatus,
)
from app.models.integration_property import IntegrationProperty
from app.models.user import User
from app.schemas.property_deployment import (
    PropertyDeploymentCreate,
    PropertyDeploymentUpdate,
    DeploymentHeartbeatCreate,
)


class DeploymentService:
    def __init__(self, db: Session):
        self.db = db

    def list_deployments(self, property_id: UUID) -> list[PropertyDeployment]:
        return (
            self.db.query(PropertyDeployment)
            .filter(PropertyDeployment.property_id == property_id)
            .order_by(PropertyDeployment.created_at.desc())
            .all()
        )

    def get_deployment(self, deployment_id: UUID) -> PropertyDeployment:
        dep = self.db.query(PropertyDeployment).filter(PropertyDeployment.id == deployment_id).first()
        if not dep:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment target not found",
            )
        return dep

    def create_deployment(
        self, property_id: UUID, current_user: User, data: PropertyDeploymentCreate
    ) -> PropertyDeployment:
        # Verify property exists
        prop = self.db.query(IntegrationProperty).filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == current_user.organization_id,
        ).first()

        if not prop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Property not found",
            )

        # Create PropertyDeployment
        dep = PropertyDeployment(
            property_id=property_id,
            name=data.name,
            platform=data.platform,
            identifier=data.identifier,
            status=DeploymentStatus.created,
        )
        self.db.add(dep)
        self.db.flush()

        # Create Version 1 (Draft) configuration
        config_version = DeploymentConfigurationVersion(
            deployment_id=dep.id,
            version_number=1,
            status="draft",
            settings=data.settings or {},
            created_by=current_user.id,
        )
        self.db.add(config_version)
        self.db.flush()

        dep.active_version_id = config_version.id
        self.db.commit()
        self.db.refresh(dep)
        return dep

    def update_deployment(
        self, deployment_id: UUID, current_user: User, data: PropertyDeploymentUpdate
    ) -> PropertyDeployment:
        dep = self.get_deployment(deployment_id)

        # Basic fields update
        if data.name is not None:
            dep.name = data.name
        if data.identifier is not None:
            dep.identifier = data.identifier
        if data.status is not None:
            dep.status = data.status

        # Configuration Settings update
        if data.settings is not None:
            # Query last/active version
            active_ver = None
            if dep.active_version_id:
                active_ver = self.db.query(DeploymentConfigurationVersion).filter(
                    DeploymentConfigurationVersion.id == dep.active_version_id
                ).first()

            if active_ver and active_ver.status == "draft":
                # Overwrite draft configuration directly
                active_ver.settings = data.settings
                active_ver.updated_at = datetime.now(timezone.utc)
            else:
                # Active version is published or archived: Create a new draft
                # Resolve next version number
                max_ver_num = (
                    self.db.query(DeploymentConfigurationVersion.version_number)
                    .filter(DeploymentConfigurationVersion.deployment_id == dep.id)
                    .order_by(desc(DeploymentConfigurationVersion.version_number))
                    .first()
                )
                next_ver = (max_ver_num[0] + 1) if max_ver_num else 1

                new_draft = DeploymentConfigurationVersion(
                    deployment_id=dep.id,
                    version_number=next_ver,
                    status="draft",
                    settings=data.settings,
                    created_by=current_user.id,
                )
                self.db.add(new_draft)
                self.db.flush()

                dep.active_version_id = new_draft.id

        self.db.commit()
        self.db.refresh(dep)
        return dep

    def list_versions(self, deployment_id: UUID) -> list[DeploymentConfigurationVersion]:
        return (
            self.db.query(DeploymentConfigurationVersion)
            .filter(DeploymentConfigurationVersion.deployment_id == deployment_id)
            .order_by(desc(DeploymentConfigurationVersion.version_number))
            .all()
        )

    def publish_version(
        self, deployment_id: UUID, current_user: User, version_id: UUID
    ) -> PropertyDeployment:
        dep = self.get_deployment(deployment_id)

        target_ver = self.db.query(DeploymentConfigurationVersion).filter(
            DeploymentConfigurationVersion.id == version_id,
            DeploymentConfigurationVersion.deployment_id == dep.id,
        ).first()

        if not target_ver:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Configuration version not found",
            )

        # Set currently published versions to archived
        self.db.query(DeploymentConfigurationVersion).filter(
            DeploymentConfigurationVersion.deployment_id == dep.id,
            DeploymentConfigurationVersion.status == "published",
        ).update({"status": "archived"})

        # Publish target version
        target_ver.status = "published"
        dep.active_version_id = target_ver.id
        
        # Advance deployment lifecycle
        if dep.status in [DeploymentStatus.created, DeploymentStatus.configured]:
            dep.status = DeploymentStatus.published

        self.db.commit()
        self.db.refresh(dep)
        return dep

    def record_heartbeat(
        self, deployment_id: UUID, data: DeploymentHeartbeatCreate
    ) -> DeploymentHeartbeat:
        dep = self.db.query(PropertyDeployment).filter(PropertyDeployment.id == deployment_id).first()
        if not dep:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Deployment target not found",
            )

        heartbeat = DeploymentHeartbeat(
            deployment_id=dep.id,
            sdk_version=data.sdk_version,
            os_version=data.os_version,
            device_model=data.device_model,
            status="online",
            received_at=datetime.now(timezone.utc),
        )
        self.db.add(heartbeat)

        # Trigger Verified transition on heartbeat reception
        if dep.status == DeploymentStatus.created:
            dep.status = DeploymentStatus.configured
        elif dep.status == DeploymentStatus.configured:
            dep.status = DeploymentStatus.verified

        self.db.commit()
        return heartbeat
