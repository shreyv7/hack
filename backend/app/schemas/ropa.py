from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


# --- Organization Hierarchy Schemas ---

class BusinessUnitCreate(BaseModel):
    name: str
    code: str | None = None
    head_user_id: UUID | None = None


class BusinessUnitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    code: str | None = None
    head_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class DepartmentCreate(BaseModel):
    business_unit_id: UUID
    name: str
    code: str | None = None
    head_user_id: UUID | None = None


class DepartmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    business_unit_id: UUID
    organization_id: UUID
    name: str
    code: str | None = None
    head_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class TeamCreate(BaseModel):
    department_id: UUID
    name: str
    code: str | None = None
    head_user_id: UUID | None = None


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    department_id: UUID
    organization_id: UUID
    name: str
    code: str | None = None
    head_user_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


# --- Sub-component Schemas ---

class ActivityOwnerCreate(BaseModel):
    user_id: UUID
    owner_role: str


class ActivityOwnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    user_id: UUID
    owner_role: str
    user_email: str | None = None
    user_name: str | None = None


class ActivityPurposeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    purpose_id: UUID
    sort_order: int
    purpose_name: str | None = None


class ActivityDataCategoryCreate(BaseModel):
    category_name: str
    is_special: bool = False
    sensitivity: str = "standard"


class ActivityDataCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    category_name: str
    is_special: bool
    sensitivity: str


class ActivityDataPrincipalCreate(BaseModel):
    category_name: str
    description: str | None = None
    includes_children: bool = False


class ActivityDataPrincipalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    category_name: str
    description: str | None = None
    includes_children: bool


class ActivityLawfulBasisCreate(BaseModel):
    basis_type: str
    justification: str | None = None
    dpdpa_section: str | None = None
    lia_documented: bool = False
    lia_summary: str | None = None
    lia_last_reviewed_at: datetime | None = None


class ActivityLawfulBasisRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    basis_type: str
    justification: str | None = None
    dpdpa_section: str | None = None
    lia_documented: bool
    lia_summary: str | None = None
    lia_last_reviewed_at: datetime | None = None


class ActivitySystemCreate(BaseModel):
    system_name: str
    system_type: str
    location: str | None = None
    description: str | None = None
    property_id: UUID | None = None
    channel: str | None = None


class ActivitySystemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    system_name: str
    system_type: str
    location: str | None = None
    description: str | None = None
    property_id: UUID | None = None
    channel: str | None = None
    property_name: str | None = None


class ActivityRecipientCreate(BaseModel):
    recipient_type: str
    name: str
    data_shared: str | None = None
    data_processor_id: UUID | None = None


class ActivityRecipientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    recipient_type: str
    name: str
    data_shared: str | None = None
    data_processor_id: UUID | None = None


class ActivityCrossBorderTransferCreate(BaseModel):
    destination_country: str
    destination_entity: str | None = None
    adequacy_status: str = "unknown"
    safeguard_mechanism: str | None = None
    legal_basis: str | None = None


class ActivityCrossBorderTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    destination_country: str
    destination_entity: str | None = None
    adequacy_status: str
    safeguard_mechanism: str | None = None
    legal_basis: str | None = None


class ActivityRetentionPolicyCreate(BaseModel):
    retention_period: str
    trigger_event: str | None = None
    legal_basis: str | None = None
    auto_delete: bool = False
    retention_policy_id: UUID | None = None


class ActivityRetentionPolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    retention_period: str
    trigger_event: str | None = None
    legal_basis: str | None = None
    auto_delete: bool
    retention_policy_id: UUID | None = None
    linked_policy_name: str | None = None
    effective_retention_period: str | None = None
    effective_trigger_event: str | None = None
    effective_legal_basis: str | None = None


class ActivityDataSourceCreate(BaseModel):
    data_source_id: UUID
    role: str = "primary"
    notes: str | None = None


class ActivityDataSourceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    data_source_id: UUID
    role: str
    notes: str | None = None
    data_source_name: str | None = None


class RopaBankingContext(BaseModel):
    channels: list[str] = Field(default_factory=list)
    identifier_types: list[str] = Field(default_factory=list)
    primary_identifier: str | None = None
    secondary_identifiers: list[str] = Field(default_factory=list)
    consent_journey_keys: list[str] = Field(default_factory=list)


class LinkedConsentNoticeRead(BaseModel):
    notice_id: UUID
    notice_name: str
    version_id: UUID
    version_status: str
    purpose_names: list[str] = Field(default_factory=list)


class ActivitySecurityMeasureCreate(BaseModel):
    measure_type: str
    description: str | None = None
    status: str = "active"


class ActivitySecurityMeasureRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    measure_type: str
    description: str | None = None
    status: str


class ActivityDpiaLinkRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    dpia_id: UUID
    link_type: str
    dpia_title: str | None = None
    dpia_status: str | None = None


class ActivityApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    version_id: UUID | None = None
    role_required: str
    approver_id: UUID | None = None
    status: str
    comments: str | None = None
    decided_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class ActivityEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    event_type: str
    actor_user_id: UUID | None = None
    actor_name: str | None = None
    details: dict | None = None
    previous_state: dict | None = None
    new_state: dict | None = None
    ip_address: str | None = None
    chain_hash: str
    created_at: datetime


# --- Main Processing Activity Schemas ---

class ProcessingActivityCreate(BaseModel):
    title: str
    description: str | None = None
    business_unit_id: UUID
    department_id: UUID | None = None
    team_id: UUID | None = None
    
    # Sub-relations payload (optional)
    purposes: list[UUID] = Field(default_factory=list)
    owners: list[ActivityOwnerCreate] = Field(default_factory=list)
    data_categories: list[ActivityDataCategoryCreate] = Field(default_factory=list)
    data_principals: list[ActivityDataPrincipalCreate] = Field(default_factory=list)
    lawful_bases: list[ActivityLawfulBasisCreate] = Field(default_factory=list)
    systems: list[ActivitySystemCreate] = Field(default_factory=list)
    recipients: list[ActivityRecipientCreate] = Field(default_factory=list)
    cross_border_transfers: list[ActivityCrossBorderTransferCreate] = Field(default_factory=list)
    retention_policies: list[ActivityRetentionPolicyCreate] = Field(default_factory=list)
    security_measures: list[ActivitySecurityMeasureCreate] = Field(default_factory=list)
    data_sources: list[ActivityDataSourceCreate] = Field(default_factory=list)
    banking_context: RopaBankingContext | None = None


class ProcessingActivityUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    business_unit_id: UUID | None = None
    department_id: UUID | None = None
    team_id: UUID | None = None
    status: str | None = None
    
    # Optional updates for sub-relations (if provided, they overwrite)
    purposes: list[UUID] | None = None
    owners: list[ActivityOwnerCreate] | None = None
    data_categories: list[ActivityDataCategoryCreate] | None = None
    data_principals: list[ActivityDataPrincipalCreate] | None = None
    lawful_bases: list[ActivityLawfulBasisCreate] | None = None
    systems: list[ActivitySystemCreate] | None = None
    recipients: list[ActivityRecipientCreate] | None = None
    cross_border_transfers: list[ActivityCrossBorderTransferCreate] | None = None
    retention_policies: list[ActivityRetentionPolicyCreate] | None = None
    security_measures: list[ActivitySecurityMeasureCreate] | None = None
    data_sources: list[ActivityDataSourceCreate] | None = None
    banking_context: RopaBankingContext | None = None


class ProcessingActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    activity_ref: str
    title: str
    description: str | None = None
    status: str
    risk_score: int
    risk_level: str
    business_unit_id: UUID
    department_id: UUID | None = None
    team_id: UUID | None = None
    current_version_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    
    # Simple denormalized metadata names
    business_unit_name: str | None = None
    department_name: str | None = None
    team_name: str | None = None
    banking_context: RopaBankingContext | None = None


class ActivityVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    activity_id: UUID
    version_number: int
    status: str
    snapshot_json: dict
    changelog: str | None = None
    created_by_id: UUID | None = None
    approved_at: datetime | None = None
    created_at: datetime


class ProcessingActivityDetailRead(ProcessingActivityRead):
    versions: list[ActivityVersionRead] = Field(default_factory=list)
    owners: list[ActivityOwnerRead] = Field(default_factory=list)
    purposes: list[ActivityPurposeRead] = Field(default_factory=list)
    data_categories: list[ActivityDataCategoryRead] = Field(default_factory=list)
    data_principals: list[ActivityDataPrincipalRead] = Field(default_factory=list)
    lawful_bases: list[ActivityLawfulBasisRead] = Field(default_factory=list)
    systems: list[ActivitySystemRead] = Field(default_factory=list)
    recipients: list[ActivityRecipientRead] = Field(default_factory=list)
    cross_border_transfers: list[ActivityCrossBorderTransferRead] = Field(default_factory=list)
    retention_policies: list[ActivityRetentionPolicyRead] = Field(default_factory=list)
    security_measures: list[ActivitySecurityMeasureRead] = Field(default_factory=list)
    dpia_links: list[ActivityDpiaLinkRead] = Field(default_factory=list)
    data_sources: list[ActivityDataSourceRead] = Field(default_factory=list)
    linked_consent_notices: list[LinkedConsentNoticeRead] = Field(default_factory=list)
    approvals: list[ActivityApprovalRead] = Field(default_factory=list)


# --- Dashboard KPIs ---

class RopaDashboardKPIs(BaseModel):
    total: int
    published: int
    draft: int
    pending: int
    high_risk: int
    critical: int
    without_dpia: int
    without_owner: int
    without_retention: int
    without_purpose: int
    without_vendor: int
    cross_border: int
    ai_discovered: int
    compliance_percentage: int
    banking_enabled: bool = False
    without_channel: int = 0
    without_data_source: int = 0
    without_retention_link: int = 0
    by_channel: dict[str, int] = Field(default_factory=dict)


class RopaBankingPresetsRead(BaseModel):
    presets: dict[str, dict[str, Any]]
    identifier_types: list[dict[str, Any]] = Field(default_factory=list)
    journeys: list[dict[str, Any]] = Field(default_factory=list)


class CreateDpiaFromActivityRead(BaseModel):
    dpia_id: UUID
    dpia_ref: str
    title: str
    link_id: UUID


# --- Version Control & Diffs ---

class VersionDiffRead(BaseModel):
    version_a_number: int
    version_b_number: int
    diff_data: dict[str, Any]


class RopaApprovalDecision(BaseModel):
    status: str  # approved | rejected
    comments: str | None = None


class RopaCheckoutPayload(BaseModel):
    changelog: str


class RopaRollbackPayload(BaseModel):
    version_id: UUID


class RopaDiscoverySuggestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    source_type: str
    source_name: str
    description: str | None = None
    suggested_title: str
    suggested_description: str | None = None
    suggested_data_categories: list[str] = Field(default_factory=list)
    suggested_lawful_basis: str | None = None
    suggested_recipient: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime

