"""Property verification — results of installation checks."""

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class PropertyVerification(Base, BaseModel):
    __tablename__ = "property_verifications"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Check results
    snippet_detected = Column(Boolean, nullable=False, default=False)
    banner_rendered = Column(Boolean, nullable=False, default=False)
    loaded_before_trackers = Column(Boolean, nullable=False, default=False)
    ssl_valid = Column(Boolean, nullable=False, default=False)
    correct_property_id = Column(Boolean, nullable=False, default=False)
    
    # Computed overall status
    all_passed = Column(Boolean, nullable=False, default=False)

    # Diagnostics
    http_status_code = Column(Integer, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    detected_trackers = Column(JSON, nullable=False, server_default="[]")
    errors = Column(JSON, nullable=False, server_default="[]")

    # Metadata
    check_type = Column(String(20), nullable=False, default="manual")  # manual | scheduled
    checked_at = Column(DateTime(timezone=True), nullable=False)
    checked_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    property = relationship("IntegrationProperty")
