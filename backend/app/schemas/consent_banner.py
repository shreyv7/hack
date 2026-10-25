"""Consent Banner schemas."""

from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class BannerCreate(BaseModel):
    name: str
    version: str = "v1.0"
    status: str = "Draft"
    consents: int = 0
    deployed_on: list[dict] = []
    languages: int = 1
    purposes: int = 1
    description: str | None = None
    banner_purpose_type: list[str] = ["cookie"]
    banner_purpose_custom: str | None = Field(default=None, max_length=500)
    display_style: str = "banner"
    position: str = "bottom"
    theme: str = "#4F46E5"
    template: str = "classic"
    heading: str | None = None
    body_text: str | None = None
    cta_accept: str = "Accept All"
    cta_reject: str = "Reject All"
    cta_customize: str = "Customize"
    cta_withdraw: str | None = "Withdraw Consent"
    show_withdraw_action: bool = False
    privacy_policy_url: str | None = None
    cookie_policy_url: str | None = None
    dpo_email: str | None = None
    show_language_switcher: bool = True
    ab_test_enabled: bool = False
    ab_variant_theme: str | None = None
    ab_variant_display_style: str | None = None
    ab_variant_position: str | None = None
    ab_variant_template: str | None = None
    ab_variant_custom_css: str | None = Field(default=None, max_length=2500)
    ab_traffic_split: int = 50
    ab_test_duration_days: int = 14
    developer_mode: bool = False
    consent_webhook_url: str | None = Field(default=None, max_length=500)
    custom_css: str | None = Field(default=None, max_length=2500)
    properties: list[str] = []
    language_detection_settings: dict | str | None = None
    translations: dict | None = None
    consent_valid_days: int = 365
    consent_notice_id: UUID | None = None


class WebhookTestRequest(BaseModel):
    url: str | None = Field(default=None, max_length=500)
    event_type: str | None = Field(default="consent.test", max_length=100)


class WebhookTestResponse(BaseModel):
    success: bool
    status_code: int | None = None
    latency_ms: int
    message: str
    payload: dict
    delivery_log_id: str | None = None


class BannerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    version: str
    status: str
    consents: int
    deployed_on: list[dict]
    languages: int
    purposes: int
    description: str | None
    banner_purpose_type: list[str]
    banner_purpose_custom: str | None
    display_style: str
    position: str
    theme: str
    template: str
    heading: str | None
    body_text: str | None
    cta_accept: str
    cta_reject: str
    cta_customize: str
    cta_withdraw: str | None = None
    show_withdraw_action: bool = False
    privacy_policy_url: str | None
    cookie_policy_url: str | None
    dpo_email: str | None
    show_language_switcher: bool
    ab_test_enabled: bool
    ab_variant_theme: str | None
    ab_variant_display_style: str | None
    ab_variant_position: str | None
    ab_variant_template: str | None
    ab_variant_custom_css: str | None
    ab_traffic_split: int
    ab_test_duration_days: int
    ab_test_started_at: datetime | None = None
    developer_mode: bool
    consent_webhook_url: str | None
    custom_css: str | None
    properties: list[str] = []
    language_detection_settings: dict | str | None = None
    translations: dict | None = None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None = None
    consent_valid_days: int
    consent_notice_id: UUID | None = None


class ConsentActivityRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    banner_id: UUID | None = None
    action: str
    banner_name: str
    banner_version: str
    user_name: str
    deployed_on: list[dict] = []
    created_at: datetime
    updated_at: datetime

