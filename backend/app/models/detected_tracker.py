import enum

from sqlalchemy import Column, Enum, ForeignKey, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class TrackerType(str, enum.Enum):
    cookie = "cookie"
    local_storage = "local_storage"
    session_storage = "session_storage"
    pixel = "pixel"


class TrackerCategory(str, enum.Enum):
    essential = "essential"
    analytics = "analytics"
    marketing = "marketing"
    functional = "functional"
    unknown = "unknown"


class TrackerStatus(str, enum.Enum):
    active = "active"
    inactive = "inactive"


class DetectedTracker(Base, BaseModel):
    __tablename__ = "detected_trackers"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name = Column(String, nullable=False, index=True)
    
    type = Column(
        Enum(TrackerType, name="tracker_type"),
        nullable=False,
    )
    
    category = Column(
        Enum(TrackerCategory, name="tracker_category"),
        nullable=False,
        default=TrackerCategory.unknown,
    )
    
    domain = Column(String, nullable=True)
    path = Column(String, nullable=True)
    expiry = Column(String, nullable=True)
    description = Column(Text, nullable=True)

    first_detected_at = Column(DateTime(timezone=True), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=False)
    
    status = Column(
        Enum(TrackerStatus, name="tracker_status"),
        nullable=False,
        default=TrackerStatus.active,
    )

    scan_job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cookie_scan_jobs.id", ondelete="SET NULL"),
        nullable=True,
    )

    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    property = relationship("IntegrationProperty", backref="detected_trackers")
    scan_job = relationship("CookieScanJob", backref="detected_trackers")
    purpose = relationship("Purpose", backref="detected_trackers")
