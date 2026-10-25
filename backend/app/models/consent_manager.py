from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ConsentManagerConnection(Base, BaseModel):
    __tablename__ = "consent_manager_connections"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider_name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="Connected")
    api_key = Column(String(255), nullable=True)
    webhook_url = Column(String(500), nullable=True)
    webhook_secret = Column(String(128), nullable=True)
    last_webhook_event_id = Column(String(128), nullable=True)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)

    # Statistics
    consents_managed = Column(String(100), nullable=False, default="0")

    organization = relationship("Organization")
