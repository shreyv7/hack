from datetime import datetime
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from uuid import UUID


class CookieScanJobRead(BaseModel):
    id: UUID
    property_id: UUID
    status: str
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    pages_scanned: int
    trackers_found: int
    error_log: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class DetectedTrackerRead(BaseModel):
    id: UUID
    property_id: UUID
    name: str
    type: str
    category: str
    domain: Optional[str] = None
    path: Optional[str] = None
    expiry: Optional[str] = None
    description: Optional[str] = None
    first_detected_at: datetime
    last_seen_at: datetime
    status: str
    scan_job_id: Optional[UUID] = None
    purpose_id: Optional[UUID] = None

    model_config = ConfigDict(from_attributes=True)

class TrackerWithOverrideRead(DetectedTrackerRead):
    override_action: str
    active_category: str
    active_purpose_id: Optional[UUID] = None


class TrackerOverrideUpdate(BaseModel):
    overridden_category: Optional[str] = None
    action: str  # allow, block, auto
    purpose_id: Optional[UUID] = None
