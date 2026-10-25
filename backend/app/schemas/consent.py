from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.consent import LegalBasis, NoticeVersionStatus


class ComplianceWarning(BaseModel):
    code: str
    message: str


class PurposeCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    legal_basis: LegalBasis = LegalBasis.consent
    data_categories: list[str] = Field(default_factory=list)
    retention_period: str = ""
    description: str | None = None
    is_special_category: bool = False
    translations: dict | None = None
    lia_summary: str | None = None
    lia_reviewed_at: datetime | None = None
    lia_reviewed_by: str | None = None


class PurposeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_basis: LegalBasis | None = None
    data_categories: list[str] | None = None
    retention_period: str | None = None
    description: str | None = None
    is_special_category: bool | None = None
    last_reviewed_at: datetime | None = None
    translations: dict | None = None
    lia_summary: str | None = None
    lia_reviewed_at: datetime | None = None
    lia_reviewed_by: str | None = None


class LinkedNoticeSummary(BaseModel):
    notice_id: UUID
    notice_name: str
    version_id: UUID
    version_number: int
    version_label: str
    status: NoticeVersionStatus


class PurposeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    legal_basis: LegalBasis
    data_categories: list[str]
    retention_period: str
    description: str | None
    is_special_category: bool
    version: str
    last_reviewed_at: datetime | None
    archived_at: datetime | None
    linked_notices_count: int = 0
    translations: dict = Field(default_factory=dict)
    lia_summary: str | None = None
    lia_reviewed_at: datetime | None = None
    lia_reviewed_by: str | None = None


class PurposeDetailRead(PurposeRead):
    linked_notices: list[LinkedNoticeSummary] = Field(default_factory=list)


class NoticeVersionContentUpdate(BaseModel):
    display_name: str | None = None
    language: str | None = None
    opening_statement: str | None = None
    contact_email: str | None = None
    contact_website: str | None = None
    dpo_name: str | None = None
    dpo_email: str | None = None
    rights_exercise: str | None = None
    complaint_process: str | None = None
    retention_policy: str | None = None
    translations: dict | None = None


class NoticeCreate(BaseModel):
    internal_name: str = Field(min_length=1, max_length=255)
    display_name: str | None = None
    language: str | None = "English"
    opening_statement: str | None = None
    contact_email: str | None = None
    contact_website: str | None = None
    dpo_name: str | None = None
    dpo_email: str | None = None
    rights_exercise: str | None = None
    complaint_process: str | None = None
    retention_policy: str | None = None
    translations: dict | None = None


class NoticeVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    notice_id: UUID
    version_number: int
    status: NoticeVersionStatus
    display_name: str
    language: str
    opening_statement: str
    contact_email: str | None
    contact_website: str | None
    dpo_name: str | None
    dpo_email: str | None
    rights_exercise: str
    complaint_process: str
    retention_policy: str
    compliance_warnings: list[ComplianceWarning]
    published_at: datetime | None
    published_by_user_id: UUID | None
    submitted_at: datetime | None = None
    legal_reviewed_at: datetime | None = None
    legal_reviewed_by_user_id: UUID | None = None
    dpo_approved_at: datetime | None = None
    dpo_approved_by_user_id: UUID | None = None
    approval_notes: list[dict] | None = None
    purpose_ids: list[UUID] = Field(default_factory=list)
    purposes: list[PurposeRead] = Field(default_factory=list)
    translations: dict = Field(default_factory=dict)


class NoticeApprovalAction(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


class NoticeApprovalQueueItem(BaseModel):
    notice_id: UUID
    notice_internal_name: str
    version_id: UUID
    version_number: int
    version_label: str
    status: NoticeVersionStatus
    display_name: str
    submitted_at: datetime | None
    warnings_count: int = 0


class NoticeSummaryRead(BaseModel):
    id: UUID
    internal_name: str
    archived_at: datetime | None
    current_version_id: UUID | None
    version_number: int | None
    version_label: str | None
    display_name: str | None
    status: NoticeVersionStatus | None
    purposes_count: int = 0
    warnings_count: int = 0
    active_since: datetime | None
    has_draft: bool = False


class NoticeDetailRead(BaseModel):
    id: UUID
    internal_name: str
    archived_at: datetime | None
    current_live_version_id: UUID | None
    versions: list[NoticeVersionRead] = Field(default_factory=list)


class NoticeVersionPurposesUpdate(BaseModel):
    purpose_ids: list[UUID] = Field(default_factory=list)


class ComplianceCheckResult(BaseModel):
    warnings: list[ComplianceWarning]
    auto_fixed: bool = False


class NoticeActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    notice_id: UUID | None
    action: str
    notice_name: str
    notice_version: str
    user_name: str
    created_at: datetime
    updated_at: datetime


class PurposeActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    purpose_id: UUID | None
    action: str
    purpose_name: str
    purpose_version: str
    user_name: str
    created_at: datetime
    updated_at: datetime


class TranslationRequest(BaseModel):
    text: str
    target_lang: str


class TranslationResponse(BaseModel):
    translatedText: str


