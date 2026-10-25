from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.data_inventory import (
    AssetStatus,
    AssetType,
    AuditAction,
    ClassificationSource,
    FieldClassification,
    SecuritySafeguard,
)


# --- Fields ---

class FieldBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data_type: str | None = Field(default=None, max_length=128)
    classification: FieldClassification = FieldClassification.unclassified
    pii_category: str | None = Field(default=None, max_length=64)
    is_encrypted: bool = False
    security_safeguard: SecuritySafeguard = SecuritySafeguard.none
    classification_source: ClassificationSource = ClassificationSource.manual
    is_child_data: bool = False
    mandatory_retention: bool = False
    mandatory_retention_days: int | None = Field(default=None, ge=1, le=36500)
    notes: str | None = None


class FieldCreate(FieldBase):
    pass


class FieldUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    data_type: str | None = Field(default=None, max_length=128)
    classification: FieldClassification | None = None
    pii_category: str | None = Field(default=None, max_length=64)
    is_encrypted: bool | None = None
    security_safeguard: SecuritySafeguard | None = None
    classification_source: ClassificationSource | None = None
    is_child_data: bool | None = None
    mandatory_retention: bool | None = None
    mandatory_retention_days: int | None = Field(default=None, ge=1, le=36500)
    notes: str | None = None


class FieldRead(FieldBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    created_at: datetime
    updated_at: datetime


# --- Assets ---

class AssetBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    asset_type: AssetType
    location: str | None = Field(default=None, max_length=255)
    owner: str | None = Field(default=None, max_length=255)
    record_count: str | None = Field(default=None, max_length=64)
    description: str | None = None
    data_categories: list[str] = Field(default_factory=list)
    status: AssetStatus = AssetStatus.active
    data_source_id: UUID | None = None
    country: str | None = Field(default=None, max_length=3)
    cross_border_transfer: bool = False
    transfer_mechanism: str | None = Field(default=None, max_length=255)
    dpia_required: bool = False
    contains_child_data: bool = False


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    asset_type: AssetType | None = None
    location: str | None = Field(default=None, max_length=255)
    owner: str | None = Field(default=None, max_length=255)
    record_count: str | None = Field(default=None, max_length=64)
    description: str | None = None
    data_categories: list[str] | None = None
    status: AssetStatus | None = None
    data_source_id: UUID | None = None
    country: str | None = Field(default=None, max_length=3)
    cross_border_transfer: bool | None = None
    transfer_mechanism: str | None = Field(default=None, max_length=255)
    dpia_required: bool | None = None
    contains_child_data: bool | None = None


class AssetRead(AssetBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    data_source_name: str | None = None
    field_count: int = 0
    personal_field_count: int = 0
    sensitive_field_count: int = 0
    last_imported_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AssetDetail(AssetRead):
    fields: list[FieldRead] = Field(default_factory=list)


class InventorySummary(BaseModel):
    total_assets: int
    total_fields: int
    personal_fields: int
    sensitive_fields: int
    unclassified_fields: int
    assets_needing_review: int


class SchemaImportResult(BaseModel):
    source_id: UUID
    tables_found: int
    assets_created: int
    assets_updated: int
    fields_created: int
    fields_updated: int
    auto_classified: int
    message: str


class BulkStatusUpdate(BaseModel):
    asset_ids: list[UUID] = Field(min_length=1)
    status: AssetStatus


class BulkStatusResult(BaseModel):
    updated: int


# --- Processor / Activity links ---

class ProcessorLinkCreate(BaseModel):
    processor_id: UUID
    data_categories_shared: list[str] = Field(default_factory=list)
    notes: str | None = None


class ProcessorLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    processor_id: UUID
    processor_name: str
    processor_dpa_status: str | None = None
    data_categories_shared: list[str] = Field(default_factory=list)
    notes: str | None = None
    created_at: datetime


class ActivityLinkCreate(BaseModel):
    activity_id: UUID
    notes: str | None = None


class ActivityLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    asset_id: UUID
    activity_id: UUID
    activity_title: str
    activity_ref: str | None = None
    risk_level: str | None = None
    notes: str | None = None
    created_at: datetime


# --- Audit log ---

class AuditLogEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    asset_id: UUID
    field_id: UUID | None = None
    actor_id: UUID | None = None
    actor_email: str | None = None
    action: AuditAction
    field_name: str | None = None
    old_value: str | None = None
    new_value: str | None = None
    created_at: datetime


# --- Usage map ---

class UsagePurposeEntry(BaseModel):
    purpose_id: UUID
    purpose_name: str
    legal_basis: str
    field_ids: list[UUID] = Field(default_factory=list)
    field_names: list[str] = Field(default_factory=list)


class AssetUsageMap(BaseModel):
    asset_id: UUID
    asset_name: str
    purpose_count: int = 0
    processor_count: int = 0
    activity_count: int = 0
    purposes: list[UsagePurposeEntry] = Field(default_factory=list)
    processors: list[ProcessorLinkRead] = Field(default_factory=list)
    activities: list[ActivityLinkRead] = Field(default_factory=list)
