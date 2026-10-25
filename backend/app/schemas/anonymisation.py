from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.anonymisation import (
    AnonymisationTechnique,
    FieldRole,
    FieldTreatment,
    JobStatus,
    ScheduleKind,
)

class FieldRule(BaseModel):
    field: str
    role: FieldRole
    treatment: FieldTreatment

    @model_validator(mode="before")
    @classmethod
    def preprocess_legacy_keys(cls, data):
        if isinstance(data, dict):
            # Translate legacy key "method" to "treatment"
            if "method" in data and "treatment" not in data:
                data["treatment"] = data["method"]
            # Supply default role if missing
            if "role" not in data:
                treatment = data.get("treatment")
                if treatment in ("suppress", "pseudonymize", "mask"):
                    data["role"] = "identifier"
                elif treatment == "generalize":
                    data["role"] = "quasi_identifier"
                else:
                    data["role"] = "insensitive"
        return data



class DatasetOption(BaseModel):
    """A dataset the user can anonymise (a Data Inventory asset with a readable source)."""

    asset_id: UUID
    name: str
    source_label: str | None = None
    source_type: str | None = None
    field_count: int = 0


class DatasetPreview(BaseModel):
    asset_id: UUID
    dataset_name: str
    source_label: str | None = None
    columns: list[str]
    suggested_rules: list[FieldRule]


class DownloadJustification(BaseModel):
    """Mandatory questions answered before every dataset download (audit trail)."""

    purpose: str = Field(min_length=3, max_length=2000)        # why it's being downloaded
    shared_with: str = Field(min_length=2, max_length=512)     # where / with whom
    recipient_type: str | None = Field(default=None, max_length=64)
    notes: str | None = Field(default=None, max_length=2000)
    acknowledge: bool = False  # must be True — user confirms responsible handling


class DownloadLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    job_id: UUID
    downloaded_by_email: str | None
    file_name: str | None
    purpose: str
    shared_with: str
    recipient_type: str | None
    notes: str | None
    created_at: datetime


class AnonymisationJobCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    asset_id: UUID
    technique: AnonymisationTechnique = AnonymisationTechnique.k_anonymity
    k_threshold: int = Field(default=25, ge=1, le=100000)
    l_threshold: int = Field(default=2, ge=1, le=1000)
    # Differential privacy budget (lower ε = more noise). Used by dp_noise fields
    # / the differential_privacy technique.
    epsilon: float = Field(default=1.0, gt=0, le=20)
    schedule: ScheduleKind = ScheduleKind.one_time
    output_destination: str = "download"  # download | s3
    output_source_id: UUID | None = None
    # Governance — why this export exists and where output flows.
    business_purpose: str = Field(min_length=3, max_length=2000)
    output_recipient: str = Field(min_length=2, max_length=512)
    external_sharing: bool = False
    cross_border_expected: bool = False
    # Optional override; when omitted the server derives rules from the dataset's
    # inventory classifications.
    field_rules: list[FieldRule] | None = None


class RiskPreviewRequest(BaseModel):
    asset_id: UUID
    technique: AnonymisationTechnique = AnonymisationTechnique.k_anonymity
    k_threshold: int = Field(default=25, ge=1, le=100000)
    l_threshold: int = Field(default=2, ge=1, le=1000)
    epsilon: float = Field(default=1.0, gt=0, le=20)
    field_rules: list[FieldRule] | None = None


class RiskPreviewResult(BaseModel):
    sample_rows: int
    predicted_k: int
    risk_percent: float | None
    risk_level: str | None
    estimated_suppressed: int
    estimated_suppression_rate: float  # 0..100 over the sample
    quasi_identifiers: list[str]
    sensitive_fields: list[str]
    # The resolved field plan (after applying the technique's defaults) — lets the
    # UI show how each preset shapes the columns.
    rules: list[FieldRule] = []
    note: str | None = None


class AnonymisationJobRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    asset_id: UUID | None
    dataset_name: str | None
    source_label: str | None
    technique: AnonymisationTechnique
    k_threshold: int
    l_threshold: int
    field_rules: list[FieldRule]
    status: JobStatus
    records_processed: int
    records_suppressed: int
    k_value: int | None
    risk_percent: float | None
    risk_level: str | None
    output_filename: str | None
    output_destination: str
    output_source_id: UUID | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    epsilon: float | None
    schedule: ScheduleKind
    next_run_at: datetime | None
    run_count: int
    last_monitored_at: datetime | None
    monitor_k: int | None
    monitor_risk_percent: float | None
    monitor_status: str | None
    business_purpose: str | None = None
    requested_by_email: str | None = None
    output_recipient: str | None = None
    external_sharing: bool = False
    cross_border_expected: bool = False
    proof_vault_record_id: UUID | None = None
    technique_class: str | None = None
    created_at: datetime
    updated_at: datetime


class AnonymisationSummary(BaseModel):
    datasets_anonymised: int
    total_records: int
    total_jobs: int
    running_jobs: int
    drift_jobs: int
    avg_risk_percent: float | None
    lowest_k: int | None
    # Deprecated alias — kept for backward compatibility with older clients.
    active_jobs: int | None = None
