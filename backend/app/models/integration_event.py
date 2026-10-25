"""Integration Event — logs consent actions and property events."""

from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class IntegrationEvent(Base, BaseModel):
    __tablename__ = "integration_events"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    event_type = Column(String(50), nullable=False, index=True) # consent_given, consent_denied, consent_partial, cmp_loaded
    
    # Metadata about the event
    session_id = Column(String(255), nullable=True, index=True)
    ip_hash = Column(String(255), nullable=True) # Hashed for privacy
    user_agent = Column(String(1024), nullable=True)
    url = Column(String(2048), nullable=True)
    
    # Detailed payload (e.g. which specific purposes were accepted)
    payload = Column(JSONB, nullable=False, server_default="{}")

    created_at = Column(DateTime(timezone=True), nullable=False)

    # Relationships
    property = relationship("IntegrationProperty")
