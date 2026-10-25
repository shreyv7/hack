from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


# --- Containers ---

class TagManagerContainerCreate(BaseModel):
    property_id: UUID
    provider: str
    container_name: str
    container_identifier: str
    environment: str = "production"
    status: str = "active"
    auto_sync: bool = True
    consent_mode: bool = True


class TagManagerContainerUpdate(BaseModel):
    provider: str | None = None
    container_name: str | None = None
    container_identifier: str | None = None
    environment: str | None = None
    status: str | None = None
    auto_sync: bool | None = None
    consent_mode: bool | None = None


class TagManagerContainerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    provider: str
    container_name: str
    container_identifier: str
    environment: str
    status: str
    auto_sync: bool
    consent_mode: bool
    created_at: datetime
    updated_at: datetime
    property_domain: str | None = None


# --- Tags ---

class ManagedTagCreate(BaseModel):
    container_id: UUID
    property_id: UUID | None = None
    provider: str
    purpose_id: UUID | None = None
    tag_name: str
    trigger: str
    execution_type: str
    script_url: str | None = None
    inline_script: str | None = None
    status: str = "active"
    priority: int = 10


class ManagedTagUpdate(BaseModel):
    provider: str | None = None
    purpose_id: UUID | None = None
    tag_name: str | None = None
    trigger: str | None = None
    execution_type: str | None = None
    script_url: str | None = None
    inline_script: str | None = None
    status: str | None = None
    priority: int | None = None


class ManagedTagRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    container_id: UUID
    property_id: UUID
    provider: str
    purpose_id: UUID | None
    tag_name: str
    trigger: str
    execution_type: str
    script_url: str | None
    inline_script: str | None
    status: str
    priority: int
    created_at: datetime
    updated_at: datetime
    purpose_name: str | None = None


# --- Consent Rules ---

class TagExecutionRuleCreate(BaseModel):
    property_id: UUID
    priority: int = 10
    rule_json: dict
    status: str = "active"


class TagExecutionRuleUpdate(BaseModel):
    priority: int | None = None
    rule_json: dict | None = None
    status: str | None = None


class TagExecutionRuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    priority: int
    rule_json: dict
    status: str
    created_at: datetime
    updated_at: datetime


# --- Violations ---

class TagViolationCreate(BaseModel):
    property_id: UUID
    tag_id: UUID | None = None
    page: str
    severity: str
    reason: str


class TagViolationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    tag_id: UUID | None
    page: str
    severity: str
    reason: str
    resolved: bool
    resolved_by: UUID | None
    created_at: datetime
    updated_at: datetime
    property_domain: str | None = None
    tag_name: str | None = None
    resolved_by_name: str | None = None


# --- Daily Metrics ---

class TagManagerDailyMetricRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    date: date
    executed: int
    blocked: int
    analytics: int
    marketing: int
    functional: int
    necessary: int


class TagManagerOverviewStats(BaseModel):
    connected_properties: int
    connected_containers: int
    managed_tags: int
    blocked_today: int
    consent_success_rate: float
    misconfigured_tags: int
    health_score: int
    tag_mappings_score: int
    execution_rules_score: int
    blocked_violations_score: int
    stale_containers_score: int
    purpose_totals: dict[str, int]


# --- Trigger Simulator ---

class SimulationRequest(BaseModel):
    property_id: UUID
    consent_choices: dict[str, bool]  # e.g. {"Necessary": true, "Analytics": false, "Marketing": false}


class SimulatedTagResult(BaseModel):
    tag_id: UUID
    tag_name: str
    provider: str
    purpose_name: str | None
    status: str  # EXECUTED or BLOCKED
    reason: str
    rule_applied: bool = False
    rule_id: UUID | None = None


class SimulationResponse(BaseModel):
    property_id: UUID
    results: list[SimulatedTagResult]


# --- Settings ---

class TagManagerSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    consent_mode_v2: bool
    auto_blocker_strict: bool
    datalayer_event_prefix: str
    blocked_purposes: list
    updated_by: UUID | None
    created_at: datetime
    updated_at: datetime


class TagManagerSettingsUpdate(BaseModel):
    consent_mode_v2: bool | None = None
    auto_blocker_strict: bool | None = None
    datalayer_event_prefix: str | None = None
    blocked_purposes: list | None = None


# --- Per-tag analytics ---

class TagExecutionLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    tag_id: UUID | None
    date: date
    executed: int
    blocked: int
    purpose_name: str
    tag_name: str | None = None
