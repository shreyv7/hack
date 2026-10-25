from datetime import date, datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, Field

# --- Framework & Requirement ---
class CisoRequirementRead(BaseModel):
    id: UUID
    framework_id: UUID
    domain: str
    req_key: str
    title: str
    description: str | None = None

    class Config:
        from_attributes = True


class CisoFrameworkRead(BaseModel):
    id: UUID
    name: str
    code: str
    description: str | None = None
    requirements: list[CisoRequirementRead] = Field(default_factory=list)

    class Config:
        from_attributes = True


# --- Evidence ---
class CisoEvidenceRead(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    file_name: str
    file_type: str | None = None
    file_hash: str
    version: int
    uploader_user_id: UUID | None = None
    is_verified: bool
    verified_by_user_id: UUID | None = None
    verified_at: datetime | None = None
    expires_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CisoEvidenceCreate(BaseModel):
    name: str
    file_name: str
    file_type: str | None = None
    expires_at: datetime | None = None
    control_ids: list[UUID] | None = None


# --- Risks ---
class CisoRiskRead(BaseModel):
    id: UUID
    organization_id: UUID
    risk_id: str
    title: str
    category: str | None = None
    likelihood: int
    impact: int
    score: int
    owner_user_id: UUID | None = None
    status: str
    treatment: str | None = None
    residual_score: int | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CisoRiskCreate(BaseModel):
    title: str
    category: str | None = None
    likelihood: int = 3
    impact: int = 3
    owner_user_id: UUID | None = None
    status: str = "open"
    treatment: str | None = None
    residual_score: int | None = None


# --- Remediation Tasks ---
class CisoRemediationTaskRead(BaseModel):
    id: UUID
    organization_id: UUID
    task_ref: str
    title: str
    description: str | None = None
    owner_user_id: UUID | None = None
    status: str
    priority: str
    progress: int
    due_date: date | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CisoRemediationTaskCreate(BaseModel):
    title: str
    description: str | None = None
    owner_user_id: UUID | None = None
    status: str = "open"
    priority: str = "medium"
    progress: int = 0
    due_date: date | None = None


class CisoRemediationTaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    owner_user_id: UUID | None = None
    status: str | None = None
    priority: str | None = None
    progress: int | None = None
    due_date: date | None = None


# --- Exceptions ---
class CisoExceptionRead(BaseModel):
    id: UUID
    organization_id: UUID
    control_id: UUID
    exception_type: str
    approved_by_user_id: UUID | None = None
    expires_at: datetime | None = None
    reason: str
    compensating_controls: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CisoExceptionCreate(BaseModel):
    control_id: UUID
    exception_type: str = "temporary"
    expires_at: datetime | None = None
    reason: str
    compensating_controls: str | None = None


# --- Control Comments & Reviews ---
class CisoControlCommentRead(BaseModel):
    id: UUID
    control_id: UUID
    comment: str
    author_user_id: UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CisoControlCommentCreate(BaseModel):
    comment: str


class CisoControlReviewRead(BaseModel):
    id: UUID
    control_id: UUID
    reviewer_user_id: UUID | None = None
    outcome: str
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class CisoControlReviewCreate(BaseModel):
    outcome: str
    notes: str | None = None


# --- Control ---
class CisoControlRead(BaseModel):
    id: UUID
    organization_id: UUID
    control_key: str
    title: str
    description: str | None = None
    tech_explanation: str | None = None
    business_explanation: str | None = None
    why_required: str | None = None
    penalty_if_absent: str | None = None
    status: str
    priority: str
    category: str | None = None
    maturity: str | None = None
    tags: list[str] = Field(default_factory=list)
    owner_user_id: UUID | None = None
    assets_covered: list[dict[str, Any]] = Field(default_factory=list)
    linked_policies: list[dict[str, Any]] = Field(default_factory=list)
    linked_vendors: list[dict[str, Any]] = Field(default_factory=list)
    linked_dpias: list[dict[str, Any]] = Field(default_factory=list)
    linked_ropas: list[dict[str, Any]] = Field(default_factory=list)
    linked_audit_logs: list[dict[str, Any]] = Field(default_factory=list)
    
    requirements: list[CisoRequirementRead] = Field(default_factory=list)
    evidence: list[CisoEvidenceRead] = Field(default_factory=list)
    risks: list[CisoRiskRead] = Field(default_factory=list)
    remediation_tasks: list[CisoRemediationTaskRead] = Field(default_factory=list)
    exceptions: list[CisoExceptionRead] = Field(default_factory=list)
    comments: list[CisoControlCommentRead] = Field(default_factory=list)
    reviews: list[CisoControlReviewRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CisoControlCreate(BaseModel):
    control_key: str
    title: str
    description: str | None = None
    tech_explanation: str | None = None
    business_explanation: str | None = None
    why_required: str | None = None
    penalty_if_absent: str | None = None
    status: str = "not_configured"
    priority: str = "medium"
    category: str | None = None
    maturity: str | None = None
    tags: list[str] = Field(default_factory=list)
    owner_user_id: UUID | None = None
    requirement_ids: list[UUID] = Field(default_factory=list)


class CisoControlUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    tech_explanation: str | None = None
    business_explanation: str | None = None
    why_required: str | None = None
    penalty_if_absent: str | None = None
    status: str | None = None
    priority: str | None = None
    category: str | None = None
    maturity: str | None = None
    tags: list[str] = None
    owner_user_id: UUID | None = None
    assets_covered: list[dict[str, Any]] = None
    linked_policies: list[dict[str, Any]] = None
    linked_vendors: list[dict[str, Any]] = None
    linked_dpias: list[dict[str, Any]] = None
    linked_ropas: list[dict[str, Any]] = None
    linked_audit_logs: list[dict[str, Any]] = None
    requirement_ids: list[UUID] = None


# --- Score & Settings ---
class CisoScoreSettingsRead(BaseModel):
    id: UUID
    organization_id: UUID
    controls_weight: float
    evidence_weight: float
    risks_weight: float
    policies_weight: float
    vendors_weight: float
    incidents_weight: float
    thresholds: dict[str, Any]

    class Config:
        from_attributes = True


class CisoScoreSettingsUpdate(BaseModel):
    controls_weight: float | None = None
    evidence_weight: float | None = None
    risks_weight: float | None = None
    policies_weight: float | None = None
    vendors_weight: float | None = None
    incidents_weight: float | None = None
    thresholds: dict[str, Any] | None = None


class CisoScoreSnapshotRead(BaseModel):
    id: UUID
    overall_score: float
    controls_score: float
    evidence_score: float
    risks_score: float
    policies_score: float
    vendors_score: float
    incidents_score: float
    recorded_date: date

    class Config:
        from_attributes = True


class CisoBoardReportRead(BaseModel):
    id: UUID
    title: str
    file_url: str | None = None
    score_snapshot: dict[str, Any]
    created_at: datetime

    class Config:
        from_attributes = True


# --- Dashboard Summary ---
class CisoDashboardSummary(BaseModel):
    scores: dict[str, float]  # Framework scores and overall score
    previous_scores: dict[str, float]  # For showing trend arrows (e.g. ▲3%)
    risk_matrix: list[list[int]]  # 5x5 matrix counts
    penalty_exposure: dict[str, Any]  # current, max, estimated, reasons
    control_health: dict[str, Any]  # coverage, evidence_percent, automation_percent
    mttr_metrics: dict[str, Any]  # MTTD, MTTR, open, closed, SLA_percent
    board_summary: dict[str, Any]  # markdown-based posture summary


# --- Versions & Activities ---
class CisoControlVersionRead(BaseModel):
    id: UUID
    control_id: UUID
    organization_id: UUID
    version_number: int
    title: str
    description: str | None = None
    status: str
    priority: str
    assets_covered: list[dict[str, Any]] = Field(default_factory=list)
    linked_policies: list[dict[str, Any]] = Field(default_factory=list)
    linked_vendors: list[dict[str, Any]] = Field(default_factory=list)
    linked_ropas: list[dict[str, Any]] = Field(default_factory=list)
    linked_dpias: list[dict[str, Any]] = Field(default_factory=list)
    modified_by_user_id: UUID | None = None
    change_summary: str | None = None
    archived_at: datetime

    class Config:
        from_attributes = True


class CisoActivityRead(BaseModel):
    id: UUID
    organization_id: UUID
    actor_user_id: UUID | None = None
    entity_type: str
    entity_id: UUID
    activity_type: str
    payload: dict[str, Any] = Field(default_factory=dict)
    description: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Organization Control ---
class CisoOrganizationControlRead(BaseModel):
    id: UUID
    organization_id: UUID
    control_key: str
    title: str
    description: str | None = None
    status: str
    priority: str
    mapped_ciso_control_id: UUID | None = None
    cis_mappings: list[str] = Field(default_factory=list)
    iso_mappings: list[str] = Field(default_factory=list)
    dpdpa_mappings: list[str] = Field(default_factory=list)
    nist_mappings: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CisoOrganizationControlCreate(BaseModel):
    control_key: str
    title: str
    description: str | None = None
    status: str = "not_configured"
    priority: str = "medium"
    mapped_ciso_control_id: UUID | None = None
    cis_mappings: list[str] = Field(default_factory=list)
    iso_mappings: list[str] = Field(default_factory=list)
    dpdpa_mappings: list[str] = Field(default_factory=list)
    nist_mappings: list[str] = Field(default_factory=list)


class CisoOrganizationControlUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    mapped_ciso_control_id: UUID | None = None
    cis_mappings: list[str] = None
    iso_mappings: list[str] = None
    dpdpa_mappings: list[str] = None
    nist_mappings: list[str] = None


class SecurityAssetRead(BaseModel):
    id: UUID
    organization_id: UUID
    name: str
    asset_type: str
    environment: str
    provider: str
    external_ref_id: str | None = None
    security_status: str
    last_scanned_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SecurityAssetCreate(BaseModel):
    name: str
    asset_type: str
    environment: str = "production"
    provider: str
    external_ref_id: str | None = None
    security_status: str = "secure"


class SecurityAssetUpdate(BaseModel):
    name: str | None = None
    asset_type: str | None = None
    environment: str | None = None
    provider: str | None = None
    external_ref_id: str | None = None
    security_status: str | None = None


class VulnerabilityScanLogRead(BaseModel):
    id: UUID
    organization_id: UUID
    asset_id: UUID
    scanner_name: str
    findings: list[Any] = Field(default_factory=list)
    status: str
    scanned_at: datetime

    class Config:
        from_attributes = True

