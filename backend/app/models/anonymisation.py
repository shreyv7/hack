"""
Data Anonymisation — DPDPA Section 8 (data minimisation / anonymisation).

An AnonymisationJob takes a dataset (a Data Inventory asset backed by a database
table or an uploaded file), applies per-field privacy transforms, measures the
re-identification risk (k-anonymity) of the result, and writes an anonymised copy
the team can download.

Unlike Masking (reversible), anonymisation is permanent: once the link to the data
principal is removed, the data is no longer "personal data" under DPDPA.
"""

import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class AnonymisationTechnique(str, enum.Enum):
    k_anonymity = "k_anonymity"
    l_diversity = "l_diversity"
    differential_privacy = "differential_privacy"
    pseudonymization = "pseudonymization"
    generalization = "generalization"
    suppression = "suppression"
    date_shifting = "date_shifting"


class JobStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


# Per-field treatment applied to a column. The field's *role* drives the default
# treatment and whether it counts toward k-anonymity.
class FieldRole(str, enum.Enum):
    identifier = "identifier"            # direct identifier → removed/pseudonymised
    quasi_identifier = "quasi_identifier"  # combinable → generalised (counts toward k)
    sensitive = "sensitive"              # the value we protect → kept
    insensitive = "insensitive"          # not personal → kept


class FieldTreatment(str, enum.Enum):
    keep = "keep"
    suppress = "suppress"
    pseudonymize = "pseudonymize"
    generalize = "generalize"
    mask = "mask"
    date_shift = "date_shift"
    dp_noise = "dp_noise"  # differential-privacy Laplace noise (numeric columns)


class ScheduleKind(str, enum.Enum):
    one_time = "one_time"
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class AnonymisationJob(Base, BaseModel):
    __tablename__ = "anonymisation_jobs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)

    # The dataset: a Data Inventory asset (table/file). SET NULL keeps the job
    # record if the asset is later removed.
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    dataset_name = Column(String(255), nullable=True)   # snapshot label
    source_label = Column(String(255), nullable=True)   # snapshot of the source name

    technique = Column(
        Enum(AnonymisationTechnique, name="anonymisation_technique"), nullable=False
    )
    k_threshold = Column(Integer, nullable=False, server_default="25")
    # l-diversity target (distinct sensitive values per group); used when
    # technique = l_diversity.
    l_threshold = Column(Integer, nullable=False, server_default="2")
    # [{field, role, treatment}, ...]
    field_rules = Column(JSON, nullable=False, server_default="[]")

    status = Column(Enum(JobStatus, name="anonymisation_job_status"), nullable=False, default=JobStatus.pending)
    records_processed = Column(Integer, nullable=False, server_default="0")
    # Rows dropped to satisfy the k/l guarantee (record suppression).
    records_suppressed = Column(Integer, nullable=False, server_default="0")
    # Measured k-anonymity of the output (smallest equivalence class on the
    # quasi-identifiers) and the derived re-identification risk.
    k_value = Column(Integer, nullable=True)
    risk_percent = Column(Float, nullable=True)
    risk_level = Column(String(16), nullable=True)  # low | medium | high

    output_filename = Column(String(255), nullable=True)
    output_path = Column(String(1024), nullable=True)  # never serialised to client
    error = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    # --- Phase 3 ---
    # Differential privacy budget (lower ε = more noise / more privacy).
    epsilon = Column(Float, nullable=True)
    # Scheduling: recurring jobs re-run on this cadence to keep exports fresh.
    schedule = Column(Enum(ScheduleKind, name="anonymisation_schedule"), nullable=False, default=ScheduleKind.one_time)
    next_run_at = Column(DateTime(timezone=True), nullable=True)
    run_count = Column(Integer, nullable=False, server_default="0")
    # Continuous re-identification risk monitor (drift detection on the live source).
    last_monitored_at = Column(DateTime(timezone=True), nullable=True)
    monitor_k = Column(Integer, nullable=True)
    monitor_risk_percent = Column(Float, nullable=True)
    monitor_status = Column(String(16), nullable=True)  # ok | drift
    # Output destination: download (default) or write to a connected store.
    output_destination = Column(String(32), nullable=False, server_default="download")  # download | s3
    output_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
    )

    # --- Governance (DPDPA accountability) ---
    business_purpose = Column(Text, nullable=True)
    requested_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    requested_by_email = Column(String(320), nullable=True)
    output_recipient = Column(String(512), nullable=True)
    external_sharing = Column(Boolean, nullable=False, server_default="false")
    cross_border_expected = Column(Boolean, nullable=False, server_default="false")
    proof_vault_record_id = Column(
        UUID(as_uuid=True),
        ForeignKey("proof_vault_records.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
