"""Page coverage scan — tracks which pages on a property have the CMP installed."""

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class PageCoverageScan(Base, BaseModel):
    __tablename__ = "page_coverage_scans"

    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    status = Column(String(20), nullable=False, default="in_progress")  # in_progress | completed | failed
    
    total_pages_found = Column(Integer, nullable=False, default=0)
    pages_with_cmp = Column(Integer, nullable=False, default=0)
    pages_without_cmp = Column(Integer, nullable=False, default=0)
    coverage_percentage = Column(Float, nullable=False, default=0.0)

    # Detailed results
    pages_missing_cmp_urls = Column(JSON, nullable=False, server_default="[]")
    
    started_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    started_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    property = relationship("IntegrationProperty")
    pages = relationship(
        "CoveragePage",
        back_populates="scan",
        cascade="all, delete-orphan",
    )


class CoveragePage(Base, BaseModel):
    __tablename__ = "coverage_pages"

    scan_id = Column(
        UUID(as_uuid=True),
        ForeignKey("page_coverage_scans.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    url = Column(String(2048), nullable=False)
    status = Column(String(50), nullable=False, default="completed")  # completed | failed
    issues = Column(JSON, nullable=False, server_default="[]")
    snippet_detected = Column(Boolean, nullable=False, default=False)
    load_time = Column(Integer, nullable=True)  # in milliseconds

    # Relationships
    scan = relationship("PageCoverageScan", back_populates="pages")
