"""
PII Scanner — samples real column values from a data source, runs the value-level
detectors, and records findings that upgrade the Data Inventory's name-based
classifications to data-verified ones.

  * PiiScanJob — one scan run against a data source.
  * PiiFinding — a column found to contain a PII category (with confidence),
    linked back to the inventory asset/field it updated.
  * PiiScanSchedule — a recurring scan configuration (DPDPA Sec 10 continuous
    monitoring expectation for significant data fiduciaries) evaluated by
    `run_due_schedules` (see governance dashboard schedules for the same
    manually-triggered pattern; no standalone daemon in this codebase).
"""

import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel
from app.models.data_inventory import FieldClassification  # reused enum type


class ScanStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"


class ScanFrequency(str, enum.Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class FindingStatus(str, enum.Enum):
    detected = "detected"      # auto-applied to inventory, awaiting review
    dismissed = "dismissed"    # rejected by a human; inventory reverted


class PiiScanJob(Base, BaseModel):
    __tablename__ = "pii_scan_jobs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status = Column(Enum(ScanStatus, name="pii_scan_status"), nullable=False, default=ScanStatus.running)
    sample_size = Column(Integer, nullable=False, server_default="100")
    tables_scanned = Column(Integer, nullable=False, server_default="0")
    columns_scanned = Column(Integer, nullable=False, server_default="0")
    fields_flagged = Column(Integer, nullable=False, server_default="0")
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    error = Column(Text, nullable=True)
    triggered_by = Column(String(255), nullable=True)

    findings = relationship(
        "PiiFinding",
        back_populates="scan_job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PiiFinding(Base, BaseModel):
    __tablename__ = "pii_findings"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_job_id = Column(
        UUID(as_uuid=True),
        ForeignKey("pii_scan_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    field_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_fields.id", ondelete="SET NULL"),
        nullable=True,
    )
    table_name = Column(String(255), nullable=False)
    column_name = Column(String(255), nullable=False)
    pii_category = Column(String(64), nullable=False)
    classification = Column(
        Enum(FieldClassification, name="field_classification", create_type=False),
        nullable=False,
    )
    match_count = Column(Integer, nullable=False, server_default="0")
    sample_count = Column(Integer, nullable=False, server_default="0")
    confidence = Column(Integer, nullable=False, server_default="0")  # 0-100
    example_masked = Column(String(255), nullable=True)
    status = Column(
        Enum(FindingStatus, name="pii_finding_status"),
        nullable=False,
        default=FindingStatus.detected,
    )

    scan_job = relationship("PiiScanJob", back_populates="findings")


class PiiScanSchedule(Base, BaseModel):
    """Recurring scan configuration for a data source. Evaluated on-demand via
    `POST /pii-scanner/schedules/run-due` (cron/ops trigger) — same pattern as
    `GovernanceDashboardSchedule.run_due_schedules`."""

    __tablename__ = "pii_scan_schedules"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    frequency = Column(Enum(ScanFrequency, name="pii_scan_frequency"), nullable=False, default=ScanFrequency.weekly)
    sample_size = Column(Integer, nullable=False, server_default="100")
    is_active = Column(Boolean, nullable=False, server_default="true")
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
