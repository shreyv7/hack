from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class NoticeCampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    notice_id: UUID
    notice_version_id: UUID | None = None
    delivery_strategy: str = "email_only"  # email_only, sms_only, whatsapp_only, physical_only, parallel, fallback, smart
    fallback_chain: list[str] = Field(default_factory=list)  # e.g., ["email", "sms", "whatsapp"]
    recipient_segment: str = "all"  # all, marketing, children, high_risk, renewal_due, legacy_pre_dpdpa
    schedule_type: str = "immediate"  # immediate, scheduled, event_triggered
    schedule_config: dict[str, Any] = Field(default_factory=dict)
    retry_policy: dict[str, Any] = Field(default_factory=dict)  # {"max_attempts": 3, "backoff_seconds": 300, "timeout_seconds": 30}
    campaign_purpose: str = "notice_delivery"  # notice_delivery | consent_capture
    recipient_source: str | None = None  # known_contacts | csv_upload | data_asset
    recipient_source_config: dict[str, Any] = Field(default_factory=dict)
    property_id: UUID | None = None
    recipient_snapshot: list[dict[str, Any]] | None = None


class NoticeCampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None  # draft, legal_review, dpo_approval, scheduled, running, paused, completed, archived
    delivery_strategy: str | None = None
    fallback_chain: list[str] | None = None
    recipient_segment: str | None = None
    schedule_type: str | None = None
    schedule_config: dict[str, Any] | None = None
    retry_policy: dict[str, Any] | None = None


class NoticeCampaignRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    notice_id: UUID
    notice_version_id: UUID | None
    status: str
    delivery_strategy: str
    fallback_chain: list[str]
    recipient_segment: str
    schedule_type: str
    schedule_config: dict[str, Any]
    created_by_user_id: UUID | None
    approved_by_dpo_id: UUID | None
    approved_at: datetime | None
    campaign_purpose: str = "notice_delivery"
    recipient_source: str | None = None
    recipient_source_config: dict[str, Any] = Field(default_factory=dict)
    property_id: UUID | None = None
    created_at: datetime
    updated_at: datetime


class DeliveryAttemptRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_delivery_id: UUID
    channel: str
    provider_id: UUID | None
    status: str
    attempt_number: int
    sent_at: datetime
    response_payload: dict[str, Any]
    error_message: str | None
    created_at: datetime


class CampaignDeliveryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_id: UUID
    recipient_id: str
    recipient_name: str
    recipient_email: str | None
    recipient_phone: str | None
    recipient_address: str | None
    status: str
    current_channel: str
    attempts_count: int
    last_attempt_at: datetime | None
    evidence_hash: str | None
    proof_vault_ref: str | None
    delivery_token: str | None = None
    capture_session_id: UUID | None = None
    consent_decision: str = "pending"
    consent_receipt_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    attempts: list[DeliveryAttemptRead] = Field(default_factory=list)


class NoticeDeliveryProviderCreate(BaseModel):
    channel: str
    provider_name: str
    is_active: bool = True
    config: dict[str, str] = Field(default_factory=dict)


class NoticeDeliveryProviderUpdate(BaseModel):
    provider_name: str | None = None
    is_active: bool | None = None
    config: dict[str, str] | None = None


class NoticeDeliveryProviderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    channel: str
    provider_name: str
    is_active: bool
    is_configured: bool = False
    config: dict[str, str] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class DpNotificationAutoConfig(BaseModel):
    """Auto-configuration for breach DP notification step."""

    configured_channels: list[str]
    providers_by_channel: dict[str, str]
    default_dp_channels: list[str]
    default_contact_email: str | None = None
    dispatch_ready: bool


class ConsentPortalEmailConfig(BaseModel):
    enabled: bool = False
    email_field_label: str = "Receive your consent details on email"
    email_provider_ready: bool = False
    portal_url: str | None = None


class ConsentPortalEmailConfigUpdate(BaseModel):
    enabled: bool | None = None
    email_field_label: str | None = Field(default=None, max_length=200)


class DeliveryTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    template_type: str
    subject_format: str
    body_format: str
    language: str
    created_at: datetime


class NoticeCampaignActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    campaign_id: UUID
    action: str
    actor_user_id: UUID | None
    actor_name: str
    details: str | None
    created_at: datetime


class CampaignOverviewStats(BaseModel):
    notice_reach_percent: float
    total_sent: int
    total_delivered: int
    total_opened: int
    total_acknowledged: int
    total_failed: int
    total_cost: float
    compliance_score: float
    sla_compliance: str
    channel_costs: dict[str, float] = Field(default_factory=dict)


class SmartAudienceDiff(BaseModel):
    already_informed: int
    need_update: int
    already_acknowledged: int
    withdrawn_users: int
    cannot_contact: int


class UserNotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    recipient_id: str
    title: str
    message: str
    category: str
    action_url: str | None
    severity: str
    is_read: bool
    created_at: datetime


class UserNotificationUnreadCount(BaseModel):
    unread_count: int


class RecipientContactRead(BaseModel):
    id: str
    name: str
    email: str | None = None
    phone: str | None = None
    last_consent_at: str | None = None
    last_purposes: dict[str, Any] | None = None


class CampaignRecipientUploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    campaign_id: UUID | None
    original_filename: str
    column_headers: list[str]
    field_map: dict[str, str]
    row_count: int
    status: str
    created_at: datetime


class CampaignRecipientPreview(BaseModel):
    total: int
    preview: list[dict[str, Any]]
    warnings: list[str] = Field(default_factory=list)
    upload_id: str | None = None
    status: str | None = None


class CampaignRecipientMappingUpdate(BaseModel):
    field_map: dict[str, str]


class DataAssetRecipientPreviewRequest(BaseModel):
    asset_id: UUID
    field_map: dict[str, str]


class EmailCampaignDecisionRequest(BaseModel):
    decision_type: str = Field(description="accept | reject | customize")
    consented_purposes: dict[str, bool]
    language: str = "en"


class EmailCampaignOtpVerifyRequest(BaseModel):
    otp_code: str = Field(min_length=4, max_length=8)

