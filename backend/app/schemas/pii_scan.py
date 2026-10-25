from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.data_inventory import FieldClassification
from app.models.pii_scan import FindingStatus, ScanFrequency, ScanStatus


class ScanStartRequest(BaseModel):
    data_source_id: UUID
    sample_size: int = Field(default=100, ge=10, le=5000)


class FindingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scan_job_id: UUID
    asset_id: UUID | None
    field_id: UUID | None
    # Which data source this finding came from (resolved via its scan job) — used
    # to group / filter the findings review by source.
    data_source_id: UUID | None = None
    data_source_name: str | None = None
    table_name: str
    column_name: str
    pii_category: str
    classification: FieldClassification
    match_count: int
    sample_count: int
    confidence: int
    example_masked: str | None
    status: FindingStatus
    created_at: datetime

    # --- DPDPA compliance-linkage flags (computed at read time; see
    # PiiScanService._compliance_flags) — these are what turn a plain "PII
    # found" list into an accountability signal: is this data tied to a
    # declared purpose, covered by a retention rule, does it belong to a
    # minor, and does it leave India? ---
    has_purpose_mapping: bool = False
    has_retention_policy: bool = False
    is_child_data: bool = False
    cross_border_transfer: bool = False
    data_source_region: str | None = None


class BulkDismissRequest(BaseModel):
    """Dismiss many findings at once — by explicit ids and/or by filters.

    When `finding_ids` is given, exactly those are dismissed. Otherwise every
    still-detected finding matching the (optional) filters is dismissed."""

    finding_ids: list[UUID] | None = None
    data_source_id: UUID | None = None
    pii_category: str | None = None
    min_confidence: int | None = Field(default=None, ge=0, le=100)


class BulkDismissResult(BaseModel):
    dismissed: int
    message: str


class ScanJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    data_source_id: UUID | None
    status: ScanStatus
    sample_size: int
    tables_scanned: int
    columns_scanned: int
    fields_flagged: int
    started_at: datetime | None
    finished_at: datetime | None
    error: str | None
    triggered_by: str | None
    created_at: datetime


class ScanJobDetail(ScanJobRead):
    findings: list[FindingRead] = Field(default_factory=list)


class CategoryCount(BaseModel):
    category: str
    label: str
    count: int


class PiiScanSummary(BaseModel):
    total_scans: int
    total_findings: int
    sensitive_findings: int
    fields_flagged: int
    last_scan_at: datetime | None = None
    by_category: list[CategoryCount] = Field(default_factory=list)

    # --- coverage & compliance gap indicators ---
    running_scans: int = 0
    sources_scannable: int = 0
    sources_scanned: int = 0
    findings_without_purpose: int = 0
    findings_without_retention: int = 0
    children_data_findings: int = 0
    cross_border_findings: int = 0


class ScheduleCreate(BaseModel):
    data_source_id: UUID
    frequency: ScanFrequency = ScanFrequency.weekly
    sample_size: int = Field(default=100, ge=10, le=5000)
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    frequency: ScanFrequency | None = None
    sample_size: int | None = Field(default=None, ge=10, le=5000)
    is_active: bool | None = None


class ScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    data_source_id: UUID
    data_source_name: str | None = None
    frequency: ScanFrequency
    sample_size: int
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime


class RunDueSchedulesResult(BaseModel):
    due: int
    started: int
    failed: int
