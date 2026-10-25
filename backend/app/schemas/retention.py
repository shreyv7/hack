from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.retention import (
    PolicyStatus,
    RetentionAction,
    RetentionPeriodUnit,
    RunStatus,
    TriggerEvent,
)
from app.models.retention_obligation import ObligationStatus


class PolicyBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    data_category: str | None = Field(default=None, max_length=128)
    data_source_id: UUID | None = None
    asset_id: UUID | None = None
    trigger_field: str | None = Field(default=None, max_length=128)
    period_value: int = Field(ge=1, le=1000)
    period_unit: RetentionPeriodUnit = RetentionPeriodUnit.years
    trigger_event: TriggerEvent = TriggerEvent.creation_date
    legal_basis: str | None = Field(default=None, max_length=128)
    action: RetentionAction = RetentionAction.delete
    auto_delete: bool = False
    notify_before_days: int = Field(default=7, ge=0, le=365)
    status: PolicyStatus = PolicyStatus.active
    notes: str | None = None
    evidentiary_profile: dict | None = None
    source_purpose_id: UUID | None = None


class PolicyCreate(PolicyBase):
    pass


class PolicyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    data_category: str | None = Field(default=None, max_length=128)
    data_source_id: UUID | None = None
    asset_id: UUID | None = None
    trigger_field: str | None = Field(default=None, max_length=128)
    period_value: int | None = Field(default=None, ge=1, le=1000)
    period_unit: RetentionPeriodUnit | None = None
    trigger_event: TriggerEvent | None = None
    legal_basis: str | None = Field(default=None, max_length=128)
    action: RetentionAction | None = None
    auto_delete: bool | None = None
    notify_before_days: int | None = Field(default=None, ge=0, le=365)
    status: PolicyStatus | None = None
    notes: str | None = None
    evidentiary_profile: dict | None = None
    source_purpose_id: UUID | None = None


class PolicyRead(PolicyBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    retention_days: int = 0
    # "enforced" = a real dry-run/delete can run; "documentation" = tracked only.
    enforcement_state: str = "documentation"
    enforcement_reason: str | None = None
    last_run_at: datetime | None = None
    run_count: int = 0
    created_at: datetime
    updated_at: datetime


class PolicyImpact(BaseModel):
    """Pre-run impact of a policy: how many rows expire + referential-integrity
    warnings, so a user knows what a delete will do before executing it."""

    enforced: bool
    reason: str | None = None
    action: RetentionAction
    cutoff_date: datetime | None = None
    matched: int | None = None          # None when a live count isn't possible
    count_note: str | None = None
    has_primary_key: bool | None = None
    dependent_tables: list[str] = Field(default_factory=list)  # children referencing the target
    legal_hold_days: int = 0            # strongest per-field mandatory-retention hold
    legal_hold_fields: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class RunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    policy_id: UUID
    run_at: datetime
    cutoff_date: datetime | None
    records_matched: int
    records_deleted: int
    action: RetentionAction
    status: RunStatus
    certificate_ref: str | None
    executed_by: str | None
    detail: str | None
    created_at: datetime


class RetentionSummary(BaseModel):
    active_policies: int
    total_policies: int
    pending_confirmations: int
    records_flagged: int        # matched across pending runs
    records_deleted_total: int  # rows actually deleted (executed runs)


class RetentionEngineResult(BaseModel):
    policies_evaluated: int
    runs_created: int
    runs_executed: int
    rows_deleted: int
    flagged: int


# --- application-level obligations (Stage 4) ---

class ObligationEventRequest(BaseModel):
    """The org's app reports a lifecycle event for a data principal, creating an
    erasure obligation. Sent to the public, API-key-authenticated endpoint."""

    subject_ref: str = Field(min_length=1, max_length=255)
    trigger_event: TriggerEvent = TriggerEvent.consent_withdrawal
    data_category: str | None = Field(default=None, max_length=128)
    purpose: str | None = Field(default=None, max_length=128)
    occurred_at: datetime | None = None          # defaults to now
    # Optional overrides when no matching policy exists / to force a value.
    action: RetentionAction | None = None
    retention_days: int | None = Field(default=None, ge=0, le=36500)
    notes: str | None = None
    evidentiary_profile: dict | None = None
    source_purpose_id: UUID | None = None


class ObligationCreate(BaseModel):
    """Admin/manual creation of an obligation."""

    subject_ref: str = Field(min_length=1, max_length=255)
    trigger_event: TriggerEvent = TriggerEvent.consent_withdrawal
    data_category: str | None = Field(default=None, max_length=128)
    purpose: str | None = Field(default=None, max_length=128)
    occurred_at: datetime | None = None
    action: RetentionAction | None = None
    retention_days: int | None = Field(default=None, ge=0, le=36500)
    notes: str | None = None
    evidentiary_profile: dict | None = None
    source_purpose_id: UUID | None = None


class ObligationFulfill(BaseModel):
    """The app confirms it purged the subject; evidence is stored on the record."""

    evidence: dict | None = None
    fulfilled_by: str | None = Field(default=None, max_length=255)


class ObligationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    subject_ref: str
    data_category: str | None
    purpose: str | None
    policy_id: UUID | None
    trigger_event: TriggerEvent
    action: RetentionAction
    event_at: datetime
    due_at: datetime
    legal_hold_until: datetime | None
    status: ObligationStatus
    source: str
    fulfilled_at: datetime | None
    fulfilled_by: str | None
    evidence: dict | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class DueObligation(BaseModel):
    """Minimal payload the app polls to know what to purge."""

    id: UUID
    subject_ref: str
    data_category: str | None
    purpose: str | None
    action: RetentionAction
    due_at: datetime


class ObligationSummary(BaseModel):
    total: int
    pending: int
    due: int
    on_hold: int
    fulfilled: int


class ObligationEventResult(BaseModel):
    obligation: ObligationRead
    created: bool
    message: str


class ObligationApiInfo(BaseModel):
    events_url: str
    due_url: str
    fulfill_url: str          # template with {obligation_id}
    has_api_key: bool
    api_key_prefix: str | None = None
