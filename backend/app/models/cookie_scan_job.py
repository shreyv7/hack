import enum

from sqlalchemy import Column, Enum, ForeignKey, Integer, String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ScanStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class CookieScanJob(Base, BaseModel):
    __tablename__ = "cookie_scan_jobs"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(
        Enum(ScanStatus, name="scan_status"),
        nullable=False,
        default=ScanStatus.pending,
    )

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    pages_scanned = Column(Integer, default=0, nullable=False)
    trackers_found = Column(Integer, default=0, nullable=False)
    
    error_log = Column(Text, nullable=True)

    # Relationships
    property = relationship("IntegrationProperty", backref="cookie_scan_jobs")
