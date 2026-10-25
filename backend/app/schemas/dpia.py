from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class DpiaStepAnswerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    step_key: str
    question_key: str
    answer_text: str | None = None
    answer_json: dict | list | None = None
    compliance_status: str
    created_at: datetime
    updated_at: datetime


class DpiaStepAnswerCreate(BaseModel):
    step_key: str
    question_key: str
    answer_text: str | None = None
    answer_json: dict | list | None = None


class DpiaStepRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    step_key: str
    step_order: int
    completion_percentage: int
    status: str
    created_at: datetime
    updated_at: datetime


class DpiaControlLibraryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None = None
    control_code: str
    title: str
    description: str | None = None
    control_type: str
    mitigation_weight: float
    standards_mapping: dict | None = None
    created_at: datetime


class DpiaControlLibraryCreate(BaseModel):
    control_code: str
    title: str
    description: str | None = None
    control_type: str
    mitigation_weight: float
    standards_mapping: dict | None = None


class DpiaControlRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    risk_id: UUID
    control_library_id: UUID
    status: str
    owner_user_id: UUID | None = None
    custom_instructions: str | None = None
    verified_at: datetime | None = None
    verified_by: UUID | None = None
    created_at: datetime
    updated_at: datetime
    library_control: DpiaControlLibraryRead | None = None


class DpiaControlCreate(BaseModel):
    control_library_id: UUID
    status: str = "planned"
    owner_user_id: UUID | None = None
    custom_instructions: str | None = None


class DpiaControlUpdate(BaseModel):
    status: str | None = None
    owner_user_id: UUID | None = None
    custom_instructions: str | None = None
    verified: bool | None = None


class DpiaTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    risk_id: UUID
    control_id: UUID | None = None
    title: str
    assignee_user_id: UUID
    due_date: date | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class DpiaTaskCreate(BaseModel):
    title: str
    assignee_user_id: UUID
    due_date: date | None = None
    control_id: UUID | None = None
    status: str = "open"


class DpiaTaskUpdate(BaseModel):
    title: str | None = None
    assignee_user_id: UUID | None = None
    due_date: date | None = None
    status: str | None = None


class DpiaRiskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    title: str
    description: str | None = None
    category: str | None = None
    likelihood: int
    impact: int
    sensitivity_factor: float
    inherent_score: float
    residual_likelihood: int | None = None
    residual_impact: int | None = None
    residual_score: float | None = None
    status: str
    is_auto_escalated: bool
    created_at: datetime
    updated_at: datetime
    controls: list[DpiaControlRead] = Field(default_factory=list)
    tasks: list[DpiaTaskRead] = Field(default_factory=list)


class DpiaRiskCreate(BaseModel):
    title: str
    description: str | None = None
    category: str | None = None
    likelihood: int
    impact: int
    status: str = "identified"


class DpiaRiskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None
    likelihood: int | None = None
    impact: int | None = None
    status: str | None = None


class DpiaApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    workflow_node_id: UUID | None = None
    approver_user_id: UUID | None = None
    role_required: str
    status: str
    comments: str | None = None
    decided_at: datetime | None = None
    created_at: datetime


class DpiaApprovalDecision(BaseModel):
    status: str  # approved, rejected
    comments: str | None = None


class DpiaReportRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_id: UUID
    report_type: str
    file_path: str
    file_hash: str
    generated_by: UUID | None = None
    generated_at: datetime


class DpiaVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    version_number: int
    status: str
    changelog: str | None = None
    created_by_user_id: UUID | None = None
    approved_at: datetime | None = None
    created_at: datetime


class DpiaVersionDetailRead(DpiaVersionRead):
    step_answers: list[DpiaStepAnswerRead] = Field(default_factory=list)
    risks: list[DpiaRiskRead] = Field(default_factory=list)
    approvals: list[DpiaApprovalRead] = Field(default_factory=list)
    reports: list[DpiaReportRead] = Field(default_factory=list)


class DpiaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    dpia_ref: str
    title: str
    description: str | None = None
    current_version_id: UUID | None = None
    status: str
    created_at: datetime
    updated_at: datetime


class DpiaDetailRead(DpiaRead):
    steps: list[DpiaStepRead] = Field(default_factory=list)
    versions: list[DpiaVersionRead] = Field(default_factory=list)
    current_version: DpiaVersionDetailRead | None = None


class DpiaCreate(BaseModel):
    title: str
    description: str | None = None
    template_key: str = "standard_v1"
    go_live_date: date | None = None
    business_unit_id: UUID | None = None


class DpiaUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None


class DpiaTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID | None = None
    key: str
    name: str
    schema_definition: dict
    is_active: bool
    created_at: datetime


class DpiaTemplateCreate(BaseModel):
    key: str
    name: str
    schema_definition: dict


class DpiaDataflowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    flow_data: dict
    created_at: datetime


class DpiaDataflowUpdate(BaseModel):
    flow_data: dict


class DpiaAssetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    asset_type: str
    asset_id: UUID
    created_at: datetime


class DpiaAssetCreate(BaseModel):
    asset_type: str
    asset_id: UUID


class DpiaComplianceCheckRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    answer_id: UUID | None = None
    control_id: UUID | None = None
    obligation_code: str
    is_satisfied: bool
    created_at: datetime


class DpiaCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    parent_comment_id: UUID | None = None
    user_id: UUID
    step_key: str | None = None
    content: str
    created_at: datetime
    updated_at: datetime
    replies: list["DpiaCommentRead"] = Field(default_factory=list)


class DpiaCommentCreate(BaseModel):
    parent_comment_id: UUID | None = None
    step_key: str | None = None
    content: str


class DpiaEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dpia_id: UUID
    event_type: str
    actor_user_id: UUID | None = None
    details: dict | None = None
    previous_state: dict | None = None
    new_state: dict | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    chain_hash: str
    created_at: datetime


class DpiaEvidenceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    file_name: str
    file_path: str
    file_hash: str
    file_size: int | None = None
    uploaded_by: UUID | None = None
    uploaded_at: datetime
    linked_control_id: UUID | None = None
    linked_answer_id: UUID | None = None


class DpiaSummaryStats(BaseModel):
    total_dpias: int
    high_risk: int
    critical_risk: int
    pending_reviews: int
    pending_approvals: int
    overdue_tasks: int
    compliance_score: float
    risk_level_distribution: dict
    department_distribution: dict
    recent_events: list[DpiaEventRead] = Field(default_factory=list)
