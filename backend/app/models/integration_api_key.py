"""Integration API key — per-property authentication for cmp.js config requests."""

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class IntegrationApiKey(Base, BaseModel):
    __tablename__ = "integration_api_keys"

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
        index=True,
    )

    key_prefix = Column(String(24), nullable=False, unique=True, index=True)
    key_hash = Column(String(128), nullable=False)
    label = Column(String(100), nullable=False, default="Default")

    status = Column(String(20), nullable=False, default="active")  # active | revoked
    scope = Column(String(50), nullable=False, default="full")  # full | read_config
    allowed_origins = Column(JSON, nullable=False, server_default="[]")

    last_used_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    property = relationship("IntegrationProperty", back_populates="api_keys")
