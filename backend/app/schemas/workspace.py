from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.data_processor import DpaStatus
from app.utils.india_phone import PHONE_ERROR, try_normalize_india_phone
from app.models.dpdp_obligation_definition import RoleRequirement
from app.models.organization_settings import DeploymentModel, DpdpRole


class DataResidencyRow(BaseModel):
    category: str = ""
    region: str = ""
    cross_border: bool = False
    legal_basis: str = ""
    details: str = ""


class OrganizationSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    slug: str


class WorkspaceProfileUpdate(BaseModel):
    registered_address: str | None = None
    headquarters: str | None = None
    india_presence: str | None = None
    solution_description: str | None = None
    logo_url: str | None = None
    dpo_name: str | None = None
    dpo_email: EmailStr | None = None
    dpo_phone: str | None = None
    compliance_version: str | None = None
    changelog_summary: str | None = None
    self_attested_at: datetime | None = None
    third_party_audit_firm: str | None = None
    audit_valid_until: datetime | None = None
    org_name: str | None = Field(default=None, description="Updates organizations.name")

    @field_validator("dpo_phone", mode="before")
    @classmethod
    def validate_dpo_phone(cls, value: str | None) -> str | None:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        try:
            return try_normalize_india_phone(str(value))
        except ValueError as exc:
            raise ValueError(PHONE_ERROR) from exc


class WorkspaceIndustryUpdate(BaseModel):
    primary_industry: str | None = None
    secondary_industries: list[str] | None = None
    is_significant_data_fiduciary: bool | None = None
    data_principals_count_band: str | None = None
    annual_turnover_band: str | None = None


class WorkspaceDeploymentUpdate(BaseModel):
    deployment_model: DeploymentModel | None = None
    primary_region: str | None = None
    backup_region: str | None = None
    allowed_regions: list[str] | None = None
    data_residency: list[DataResidencyRow] | None = None


class WorkspaceRoleMappingUpdate(BaseModel):
    dpdp_role: DpdpRole | None = None
    role_assessment: dict[str, Any] | None = None


class DataProcessorRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    processor_role: str
    purpose: str | None
    dpa_status: DpaStatus
    dpa_signed_date: date | None
    risk_level: str | None
    data_categories: str | None
    location: str | None
    contact_email: str | None
    
    # TPRM Extensions
    category: str
    security_score: int
    monitoring: str
    logo: str | None
    last_audit_date: date | None
    certifications: list[str] | None
    encryption: str | None
    tier: str
    assessment_status: str
    assessment_completed_at: date | None
    last_monitored_at: datetime | None
    monitoring_status: str
    monitoring_details: dict[str, Any] | None


class DataProcessorCreate(BaseModel):
    name: str
    processor_role: str = "Data Processor"
    business_unit_id: UUID | None = None
    purpose: str | None = None
    dpa_status: DpaStatus = DpaStatus.none
    dpa_signed_date: date | None = None
    risk_level: str | None = None
    data_categories: str | None = None
    location: str | None = None
    contact_email: EmailStr | None = None
    
    # TPRM Extensions
    category: str = "Other"
    security_score: int = 80
    monitoring: str = "Continuous"
    logo: str | None = None
    last_audit_date: date | None = None
    certifications: list[str] | None = None
    encryption: str | None = None
    tier: str = "Tier 3"
    assessment_status: str = "not_started"
    assessment_completed_at: date | None = None
    last_monitored_at: datetime | None = None
    monitoring_status: str = "healthy"
    monitoring_details: dict[str, Any] | None = None


class DataProcessorUpdate(BaseModel):
    name: str | None = None
    processor_role: str | None = None
    purpose: str | None = None
    dpa_status: DpaStatus | None = None
    dpa_signed_date: date | None = None
    risk_level: str | None = None
    data_categories: str | None = None
    location: str | None = None
    contact_email: EmailStr | None = None
    
    # TPRM Extensions
    category: str | None = None
    security_score: int | None = None
    monitoring: str | None = None
    logo: str | None = None
    last_audit_date: date | None = None
    certifications: list[str] | None = None
    encryption: str | None = None
    tier: str | None = None
    assessment_status: str | None = None
    assessment_completed_at: date | None = None
    last_monitored_at: datetime | None = None
    monitoring_status: str | None = None
    monitoring_details: dict[str, Any] | None = None


class DiscoveredProcessorRead(BaseModel):
    name: str
    source: str
    risk: str
    category: str | None = None
    status: str = "unmanaged"



class DpdpObligationRead(BaseModel):
    id: UUID
    sort_order: int
    obligation: str
    description: str
    statute_reference: str
    df: RoleRequirement
    dp: RoleRequirement
    sdf: RoleRequirement


class WorkspaceSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    organization: OrganizationSummary
    registered_address: str | None = None
    headquarters: str | None = None
    india_presence: str | None = None
    solution_description: str | None = None
    logo_url: str | None = None
    dpo_name: str | None = None
    dpo_email: str | None = None
    dpo_phone: str | None = None
    compliance_version: str | None = None
    changelog_summary: str | None = None
    self_attested_at: datetime | None = None
    third_party_audit_firm: str | None = None
    audit_valid_until: datetime | None = None
    primary_industry: str | None = None
    secondary_industries: list[str] = []
    is_significant_data_fiduciary: bool = False
    data_principals_count_band: str | None = None
    annual_turnover_band: str | None = None
    deployment_model: DeploymentModel
    primary_region: str | None = None
    backup_region: str | None = None
    allowed_regions: list[str] = []
    data_residency: list[dict[str, Any]] = []
    dpdp_role: DpdpRole
    role_assessed_at: datetime | None = None
    role_assessment: dict[str, Any] | None = None
    consent_industry_config: dict[str, Any] | None = None
    processors: list[DataProcessorRead] = []


class SetupStatusRead(BaseModel):
    step1_industry: bool
    step2_property: bool
    step3_purposes: bool
    step4_notice: bool
    step5_banner: bool
    step6_translation: bool
    step7_monitor: bool


