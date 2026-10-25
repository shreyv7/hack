from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.cross_border_transfer import TransferStatus, ContractStatus


class CbtTransferCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    destination_country: str = Field(min_length=1, max_length=128)
    country_code: str = Field(min_length=2, max_length=3)
    destination_entity: str = Field(min_length=1, max_length=255)
    data_processor_id: UUID | None = None
    transfer_purpose: str | None = None
    legal_basis: str = "contract"
    adequacy_status: str = "unknown"
    safeguard_mechanism: str | None = None
    status: TransferStatus = TransferStatus.draft
    dpia_required: bool = False
    dpia_completed_at: datetime | None = None
    next_review_date: date | None = None
    dpia_id: UUID | None = None


class CbtTransferUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    destination_country: str | None = Field(default=None, min_length=1, max_length=128)
    country_code: str | None = Field(default=None, min_length=2, max_length=3)
    destination_entity: str | None = Field(default=None, min_length=1, max_length=255)
    data_processor_id: UUID | None = None
    transfer_purpose: str | None = None
    legal_basis: str | None = None
    adequacy_status: str | None = None
    safeguard_mechanism: str | None = None
    status: TransferStatus | None = None
    dpia_required: bool | None = None
    dpia_completed_at: datetime | None = None
    next_review_date: date | None = None
    dpia_id: UUID | None = None


class CbtTransferRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    data_processor_id: UUID | None
    name: str
    destination_country: str
    country_code: str
    destination_entity: str
    transfer_purpose: str | None
    legal_basis: str
    adequacy_status: str
    safeguard_mechanism: str | None
    status: TransferStatus
    is_sdf_transfer: bool
    dpia_required: bool
    dpia_completed_at: datetime | None
    next_review_date: date | None
    created_by_user_id: UUID | None
    dpia_id: UUID | None
    created_at: datetime
    updated_at: datetime


class CbtContractVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    contract_id: UUID
    version_number: int
    status: ContractStatus
    content: str
    summary: str | None
    published_at: datetime | None
    published_by_user_id: UUID | None
    created_at: datetime
    updated_at: datetime


class CbtContractRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    transfer_id: UUID
    title: str
    status: ContractStatus
    current_live_version_id: UUID | None
    created_at: datetime
    updated_at: datetime


class CbtContractDetailRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    transfer_id: UUID
    title: str
    status: ContractStatus
    current_live_version_id: UUID | None
    created_at: datetime
    updated_at: datetime
    versions: list[CbtContractVersionRead] = Field(default_factory=list)


class CbtContractCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    content: str = ""
    summary: str | None = None


class CbtSdfAssessmentCreate(BaseModel):
    assessor_name: str = Field(min_length=1, max_length=255)
    risk_level: str = "medium"
    findings: str | None = None
    mitigation_measures: str | None = None
    status: str = "pending"


class CbtSdfAssessmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    transfer_id: UUID
    assessment_date: datetime
    assessor_name: str
    risk_level: str
    findings: str | None
    mitigation_measures: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class CbtActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    transfer_id: UUID | None
    action: str
    transfer_name: str
    user_name: str
    details: dict | None
    created_at: datetime


class CbtDashboardKpis(BaseModel):
    total_transfers: int = 0
    active_transfers: int = 0
    signed_contracts: int = 0
    pending_sdf_assessments: int = 0
    restricted_countries_alert_count: int = 0
