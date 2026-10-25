"""Integration analytics — daily aggregated stats for a property."""

from sqlalchemy import Column, Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.schema import UniqueConstraint

from app.core.database import Base
from app.models.base import BaseModel


class IntegrationAnalyticsDaily(Base, BaseModel):
    __tablename__ = "integration_analytics_daily"
    __table_args__ = (
        UniqueConstraint("property_id", "banner_id", "date", name="uq_analytics_property_banner_date"),
    )

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    banner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_banners.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    date = Column(Date, nullable=False, index=True)

    # Consent Metrics
    total_visitors = Column(Integer, nullable=False, default=0)
    consent_given = Column(Integer, nullable=False, default=0)
    consent_denied = Column(Integer, nullable=False, default=0)
    consent_partial = Column(Integer, nullable=False, default=0)

    # Performance
    avg_load_time_ms = Column(Integer, nullable=False, default=0)
    config_requests = Column(Integer, nullable=False, default=0)

    # Relationships
    property = relationship("IntegrationProperty")
    banner = relationship("ConsentBanner")

