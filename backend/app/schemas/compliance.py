from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


# --- DPDPA Map ---


class ComplianceMapSummary(BaseModel):
    sections_covered: int
    sections_total: int
    sections_in_scope: int = 0
    sections_partial: int = 0
    sections_documented_only: int = 0
    coverage_percent: int = 0
    features_mapped: int
    compliance_score: int
    penalty_mitigated_crores: int
    penalty_worst_crores: int
    last_reviewed_at: datetime | None = None
    last_reviewed_by: str | None = None


class ComplianceMapChapterSection(BaseModel):
    number: str
    section_key: str
    title: str
    feature_count: int
    status: str


class ComplianceMapChapter(BaseModel):
    number: int
    title: str
    sections: list[ComplianceMapChapterSection]


class MappedFeatureRead(BaseModel):
    name: str
    status: str
    last_verified: str | None = None
    evidence_count: int
    route: str


class ComplianceMapSectionDetail(BaseModel):
    section_key: str
    title: str
    statute: str
    features: list[MappedFeatureRead]
    penalty: str


class ComplianceMapReviewUpdate(BaseModel):
    reviewed_by: str | None = None


# --- Security Safeguards ---


class SecuritySafeguardsSummary(BaseModel):
    score: int
    score_label: str
    documented_count: int
    partial_count: int
    missing_count: int
    total_controls: int
    penalty_current_crores: int
    penalty_worst_crores: int
    penalty_mitigated_crores: int


class SecurityPostureMetric(BaseModel):
    value: int
    status: str  # normal | success | warning | critical
    status_label: str


class SecurityPostureRead(BaseModel):
    failed_logins_24h: SecurityPostureMetric
    privileged_sessions: SecurityPostureMetric
    unencrypted_assets: SecurityPostureMetric
    mfa_bypass_users: SecurityPostureMetric
    anomalies: SecurityPostureMetric
    computed_at: datetime


class SecurityControlRead(BaseModel):
    id: UUID
    control_key: str
    name: str
    status: str
    items_total: int
    items_completed: int
    evidence: str | None = None
    checklist_items: list[str] = Field(default_factory=list)


class SecuritySafeguardsRead(BaseModel):
    controls: list[SecurityControlRead]
    certifications: list[dict[str, Any]]
    summary: SecuritySafeguardsSummary
    posture: SecurityPostureRead


class SecurityControlUpdate(BaseModel):
    status: str | None = None
    items_completed: int | None = None
    evidence_label: str | None = None


# --- Breach ---


class BreachIncidentRead(BaseModel):
    id: UUID
    incident_ref: str
    status: str
    discovered_at: datetime
    deadline_at: datetime
    deadline_remaining_seconds: int
    current_step: int
    severity: str
    wizard_data: dict[str, Any]
    submitted_at: datetime | None = None
    assigned_to_user_id: UUID | None = None
    escalated_to_user_id: UUID | None = None
    escalated_at: datetime | None = None


class BreachAssignRequest(BaseModel):
    assigned_to_user_id: UUID


class BreachEscalateRequest(BaseModel):
    escalated_to_user_id: UUID | None = None


class BreachIncidentCreate(BaseModel):
    severity: str | None = "medium"
    wizard_data: dict[str, Any] | None = None
    business_unit_id: UUID | None = None
    discovered_at: datetime | None = None


class BreachIncidentUpdate(BaseModel):
    current_step: int | None = None
    severity: str | None = None
    wizard_data: dict[str, Any] | None = None


class BreachAffectedVerifyRequest(BaseModel):
    incident_id: UUID | None = None
    severity: str | None = None
    incident_summary: str | None = None


class BreachAffectedVerifyResult(BaseModel):
    affected_count: int
    log_entries_analyzed: int
    unique_principals_found: int
    summary: str
    shield_ai_used: bool = False
    data_types: list[str] = []
    special_categories: list[str] = []


# --- Audit Log ---


class AuditEventRead(BaseModel):
    id: UUID
    time: datetime
    actor: str
    role: str
    action: str
    details: str
    type: str
    severity: str
    entry_hash: str
    prev_hash: str
    resource_type: str | None = None
    resource_id: str | None = None


class PaginatedAuditEvents(BaseModel):
    items: list[AuditEventRead]
    total: int
    page: int
    page_size: int


class AuditVerifyResult(BaseModel):
    merkle_root: str
    entry_count: int
    integrity_ok: bool
    verified_at: datetime


class AuditLogSummaryRead(BaseModel):
    entry_count: int
    merkle_root: str
    last_verified_at: datetime | None = None
    integrity_ok: bool | None = None
