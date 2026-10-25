"""Property ↔ Banner association — links a consent banner to a property."""

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import Index

from app.core.database import Base
from app.models.base import BaseModel


class PropertyBannerAssociation(Base, BaseModel):
    __tablename__ = "property_banner_associations"
    __table_args__ = (
        # Partial unique index: at most ONE active banner per property.
        Index(
            "uq_pba_active_per_property",
            "property_id",
            unique=True,
            postgresql_where="status = 'active'",
        ),
    )

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
    )

    # FK to a future consent_banners table — stored as UUID for now.
    banner_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    status = Column(String(20), nullable=False, default="active")  # active | inactive

    activated_at = Column(DateTime(timezone=True), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    activated_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    property = relationship("IntegrationProperty", back_populates="banner_associations")
