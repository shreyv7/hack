from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.data_source import (
    CONNECTOR_CATEGORY,
    DataSourceStatus,
    IntegrationMode,
    SourceCriticality,
    SourceEnvironment,
    category_for,
)


class DataSourceBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Granular connector slug (e.g. "postgresql", "s3", "splunk"). Validated
    # against the known catalog; see app.models.data_source.CONNECTOR_CATEGORY.
    source_type: str = Field(min_length=1, max_length=64)
    # Top-level category — derived from source_type when omitted.
    category: str | None = Field(default=None, max_length=32)
    region: str | None = Field(default=None, max_length=128)
    description: str | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    ssl_enabled: bool = False
    extra_config: dict[str, Any] = Field(default_factory=dict)
    integration_mode: IntegrationMode | None = None
    owner_user_id: UUID | None = None
    owner_name: str | None = Field(default=None, max_length=255)
    environment: SourceEnvironment = SourceEnvironment.production
    criticality: SourceCriticality = SourceCriticality.medium
    data_processor_id: UUID | None = None
    encryption_at_rest: bool = False
    tags: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def _validate_and_fill_category(self) -> "DataSourceBase":
        if self.source_type not in CONNECTOR_CATEGORY:
            known = ", ".join(sorted(CONNECTOR_CATEGORY))
            raise ValueError(f"Unknown source_type '{self.source_type}'. Expected one of: {known}")
        if not self.category:
            self.category = category_for(self.source_type)
        return self


class DataSourceCreate(DataSourceBase):
    # Write-only secret. Accepted on create/update, never returned.
    password: str | None = Field(default=None, max_length=512)


class DataSourceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    source_type: str | None = Field(default=None, min_length=1, max_length=64)
    category: str | None = Field(default=None, max_length=32)
    region: str | None = Field(default=None, max_length=128)
    description: str | None = None
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=512)
    ssl_enabled: bool | None = None
    extra_config: dict[str, Any] | None = None
    integration_mode: IntegrationMode | None = None
    owner_user_id: UUID | None = None
    owner_name: str | None = Field(default=None, max_length=255)
    environment: SourceEnvironment | None = None
    criticality: SourceCriticality | None = None
    data_processor_id: UUID | None = None
    encryption_at_rest: bool | None = None
    tags: list[str] | None = None

    @model_validator(mode="after")
    def _validate_type(self) -> "DataSourceUpdate":
        if self.source_type is not None and self.source_type not in CONNECTOR_CATEGORY:
            known = ", ".join(sorted(CONNECTOR_CATEGORY))
            raise ValueError(f"Unknown source_type '{self.source_type}'. Expected one of: {known}")
        return self


class DataSourceRead(DataSourceBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    status: DataSourceStatus
    # True when a password is set on the row (without revealing it).
    has_password: bool = False
    last_tested_at: datetime | None = None
    last_error: str | None = None
    credential_rotated_at: datetime | None = None
    residency_flag: Literal["approved", "outside_approved_residency", "unknown"] = "unknown"
    data_processor_name: str | None = None
    needs_retest: bool = False
    created_at: datetime
    updated_at: datetime


class ConnectionTestResult(BaseModel):
    success: bool
    status: DataSourceStatus
    message: str
    tested_at: datetime


class CredentialRotateRequest(BaseModel):
    password: str = Field(min_length=1, max_length=512)


class DataSourceActivityEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    data_source_id: UUID | None
    action: str
    source_name: str
    user_name: str
    details: dict[str, Any] | None = None
    created_at: datetime


class InventoryAssetSummary(BaseModel):
    id: UUID
    name: str
    field_count: int
    highest_classification: str | None = None


class PiiScanSummary(BaseModel):
    job_id: UUID | None = None
    status: str | None = None
    finished_at: datetime | None = None
    fields_flagged: int = 0
    findings_count: int = 0


class MaskingCoverageSummary(BaseModel):
    total_pii_fields: int = 0
    covered_by_rules: int = 0
    coverage_pct: float = 0.0


class RetentionPolicySummary(BaseModel):
    id: UUID
    name: str
    status: str
    action: str
    last_run_at: datetime | None = None


class CrossBorderTransferSummary(BaseModel):
    id: UUID
    name: str
    destination_country: str
    status: str


class ConsentPurposeSummary(BaseModel):
    purpose_id: UUID
    purpose_name: str
    mapped_field_count: int


class DataSourceUsageSummary(BaseModel):
    source_id: UUID
    inventory_assets: list[InventoryAssetSummary] = Field(default_factory=list)
    total_fields: int = 0
    highest_classification: str | None = None
    pii_scan: PiiScanSummary = Field(default_factory=PiiScanSummary)
    masking: MaskingCoverageSummary = Field(default_factory=MaskingCoverageSummary)
    retention_policies: list[RetentionPolicySummary] = Field(default_factory=list)
    cross_border_transfers: list[CrossBorderTransferSummary] = Field(default_factory=list)
    consent_purposes: list[ConsentPurposeSummary] = Field(default_factory=list)
