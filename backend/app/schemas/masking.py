from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.masking import MaskingStrategy
from app.models.masking_run import MaskingRunTrigger


class MaskingRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID | None = None
    pii_category: str
    strategy: MaskingStrategy
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    is_default: bool = False  # True when this is a built-in default (not yet saved)


class MaskingRuleUpsert(BaseModel):
    pii_category: str = Field(min_length=1, max_length=64)
    strategy: MaskingStrategy
    params: dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True


class PreviewRequest(BaseModel):
    value: str = Field(min_length=1, max_length=2000)
    strategy: MaskingStrategy
    params: dict[str, Any] = Field(default_factory=dict)


class PreviewResult(BaseModel):
    original: str
    masked: str
    strategy: MaskingStrategy


class FieldPreviewRequest(BaseModel):
    data_source_id: UUID
    table: str = Field(min_length=1, max_length=255)
    column: str = Field(min_length=1, max_length=255)
    strategy: MaskingStrategy | None = None  # override; else use the category rule
    limit: int = Field(default=10, ge=1, le=50)


class FieldPreviewPair(BaseModel):
    before: str
    after: str


class FieldPreviewResult(BaseModel):
    table: str
    column: str
    pii_category: str | None
    strategy: MaskingStrategy
    samples: list[FieldPreviewPair]


class ApplyMaskingRequest(BaseModel):
    data_source_id: UUID
    table: str = Field(min_length=1, max_length=255)
    column: str = Field(min_length=1, max_length=255)
    strategy: MaskingStrategy | None = None
    id_column: str | None = Field(default=None, max_length=128)
    asset_id: UUID | None = None
    inventory_field_id: UUID | None = None
    confirm: bool = False


class ApplyMaskingResult(BaseModel):
    table: str
    column: str
    pii_category: str | None
    strategy: MaskingStrategy
    rows_updated: int


class AnonymizeTextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


class DetectedEntity(BaseModel):
    entity_type: str
    score: float
    masked_sample: str


class AnonymizeTextResult(BaseModel):
    original_length: int
    anonymized_text: str
    entities: list[DetectedEntity]
    ner_engine: str  # "presidio" or "regex-fallback"


class MaskingCapabilities(BaseModel):
    ner_available: bool
    engine: str
    strategies: list[str]
    entity_types: list[str]


class PiiColumnTarget(BaseModel):
    """A PII column the scanner classified, ready to preview/mask — so the user
    doesn't have to type table/column names by hand."""

    data_source_id: UUID | None
    data_source_name: str | None
    source_type: str | None
    asset_id: UUID
    field_id: UUID
    table: str
    column: str
    pii_category: str | None
    classification: str
    strategy: MaskingStrategy | None
    rule_enabled: bool = True
    environment: str | None = None
    integration_mode: str | None = None
    security_safeguard: str | None = None
    purpose_count: int = 0
    last_applied_at: datetime | None = None
    can_apply: bool
    apply_note: str | None = None


class MaskingSourceCoverage(BaseModel):
    data_source_id: UUID
    data_source_name: str
    environment: str | None
    integration_mode: str | None
    total_pii_fields: int
    covered_by_rules: int
    coverage_pct: float
    maskable: bool


class MaskingSummary(BaseModel):
    total_pii_fields: int
    covered_by_rules: int
    coverage_pct: float
    sources_maskable: int
    sources_read_write: int
    columns_applied_last_30d: int
    uncovered_categories: list[str]
    prod_sources_discovery_only: int
    fields_safeguard_masking_unapplied: int
    sources: list[MaskingSourceCoverage] = Field(default_factory=list)


class MaskingRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    data_source_id: UUID | None
    data_source_name: str | None = None
    asset_id: UUID | None
    table_name: str
    column_name: str
    pii_category: str | None
    strategy: MaskingStrategy
    rows_updated: int
    trigger: MaskingRunTrigger
    triggered_by_user_id: UUID | None
    proof_vault_record_id: UUID | None
    created_at: datetime
