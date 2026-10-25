from datetime import datetime
from uuid import UUID
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models.integration_property import BlockerMode, PropertyEnvironment, PropertyStatus, PropertyType


class IntegrationApiKeyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    key_prefix: str
    label: str
    status: str
    last_used_at: datetime | None
    created_at: datetime
    created_by: UUID | None = None


class PropertyBannerAssociationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    property_id: UUID
    banner_id: UUID
    status: str
    activated_at: datetime | None


class PropertySettings(BaseModel):
    environment: PropertyEnvironment = PropertyEnvironment.production
    blocker_mode: BlockerMode = BlockerMode.strict
    auto_language: bool = True
    default_language: str = "en"
    geo_targeting: dict = {}
    allowed_origins: list[str] = []
    advanced_metadata: dict = {}


class IntegrationPropertyCreate(BaseModel):
    domain: str = Field(..., max_length=255)
    display_name: str | None = Field(None, max_length=255)
    property_type: PropertyType = PropertyType.website
    environment: PropertyEnvironment = PropertyEnvironment.production
    blocker_mode: BlockerMode = BlockerMode.strict
    default_language: str = Field("en", max_length=10)
    consent_notice_id: UUID | None = None
    status: PropertyStatus = PropertyStatus.pending_setup
    allowed_origins: list[str] = []
    settings: PropertySettings | None = None


class IntegrationPropertyUpdate(BaseModel):
    display_name: str | None = Field(None, max_length=255)
    property_type: PropertyType | None = None
    environment: PropertyEnvironment | None = None
    blocker_mode: BlockerMode | None = None
    auto_language: bool | None = None
    default_language: str | None = Field(None, max_length=10)
    consent_notice_id: UUID | None = None
    status: PropertyStatus | None = None
    allowed_origins: list[str] | None = None
    settings: PropertySettings | None = None


class IntegrationPropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    domain: str
    display_name: str | None
    property_type: PropertyType
    environment: PropertyEnvironment
    status: PropertyStatus
    blocker_mode: BlockerMode
    auto_language: bool
    default_language: str
    allowed_origins: list[str] = []
    consent_notice_id: UUID | None = None
    active_banner: PropertyBannerAssociationRead | None = None
    active_banner_name: str | None = None
    created_at: datetime
    updated_at: datetime
    health_score: int = 100
    health_grade: str = "Excellent"
    last_updated_time: datetime | None = None
    settings: PropertySettings = Field(default_factory=PropertySettings)


class IntegrationPropertyDetail(IntegrationPropertyRead):
    api_keys: list[IntegrationApiKeyRead] = []


class PropertyWithKey(IntegrationPropertyRead):
    api_key: str
    api_key_prefix: str


class BannerAssociationUpdate(BaseModel):
    banner_id: UUID


class IntegrationEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    event_type: str
    session_id: str | None = None
    ip_hash: str | None = None
    user_agent: str | None = None
    url: str | None = None
    payload: dict = {}
    created_at: datetime


class PropertyWebhookConfigRead(BaseModel):
    property_id: UUID
    banner_id: UUID | None = None
    url: str | None = None
    signing_secret_set: bool = False
    subscribed_events: list[str] = []
    bearer_token_set: bool = False


class PropertyWebhookConfigUpdate(BaseModel):
    url: str | None = Field(default=None, max_length=500)
    signing_secret: str | None = Field(default=None, max_length=128)
    subscribed_events: list[str] | None = None
    bearer_token: str | None = Field(default=None, max_length=512)


class OrgDataRightsWebhookConfigRead(BaseModel):
    organization_id: UUID
    url: str | None = None
    signing_secret_set: bool = False
    subscribed_events: list[str] = []
    bearer_token_set: bool = False


class OrgDataRightsWebhookConfigUpdate(BaseModel):
    url: str | None = Field(default=None, max_length=500)
    signing_secret: str | None = Field(default=None, max_length=128)
    subscribed_events: list[str] | None = None
    bearer_token: str | None = Field(default=None, max_length=512)


class WebhookDeliveryLogRead(BaseModel):
    id: UUID
    property_id: UUID
    event: str
    url: str
    status_code: int | None = None
    status_text: str
    latency_ms: int
    success: bool
    payload: dict = {}
    error: str | None = None
    attempts: int | None = None
    is_test: bool = False
    created_at: datetime


class PropertyDeleteImpact(BaseModel):
    property_name: str
    active_banners_count: int
    containers_count: int
    scanned_pages_count: int
    cookies_scanned_count: int
    api_keys_count: int
    consent_receipts_count: int
    has_relations: bool

