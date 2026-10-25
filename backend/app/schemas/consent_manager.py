from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class ConsentManagerCreate(BaseModel):
    provider_name: str
    api_key: str | None = None
    webhook_url: str | None = None


class ConsentManagerUpdate(BaseModel):
    status: str | None = None
    api_key: str | None = None
    webhook_url: str | None = None


class ConsentManagerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    provider_name: str
    status: str
    api_key: str | None
    webhook_url: str | None
    webhook_secret: str | None = None
    last_sync_at: datetime | None
    consents_managed: str


class ConsentSyncPayload(BaseModel):
    """
    Standardized payload that a Consent Manager sends to our webhook
    to sync a user's consent state.
    """
    consent_manager_id: UUID
    session_id: str | None = None
    phone_number: str | None = None
    granted_purposes: list[str]  # List of purpose names or IDs granted
    timestamp: datetime
    source: str = "consent_manager"
