from typing import Any
from pydantic import BaseModel, ConfigDict
from uuid import UUID
from datetime import datetime

class IntegrationsOverviewStats(BaseModel):
    active_integrations: int
    connected_cms: int
    events_24h: int
    cross_cm_synced: int

class SearchConsentQuery(BaseModel):
    query: str

class ConsentSearchTimelineEvent(BaseModel):
    id: UUID
    property_id: UUID
    property_domain: str
    session_id: str
    event_type: str
    ip_hash: str
    language: str
    consented_purposes: list[str]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)

class ConsentSearchResponse(BaseModel):
    results: list[ConsentSearchTimelineEvent]

class RecentActivityEvent(BaseModel):
    id: UUID
    status: str  # 'success' | 'warning'
    text: str
    source: str  # 'Technical' | 'CM'
    time: str
    action: str | None = None

class RecentActivityResponse(BaseModel):
    events: list[RecentActivityEvent]
