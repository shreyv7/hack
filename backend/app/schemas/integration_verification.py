from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PropertyVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    snippet_detected: bool
    banner_rendered: bool
    loaded_before_trackers: bool
    ssl_valid: bool
    correct_property_id: bool
    all_passed: bool
    
    http_status_code: int | None
    response_time_ms: int | None
    detected_trackers: list[dict[str, Any]]
    errors: list[str]

    check_type: str
    checked_at: datetime
    checked_by: UUID | None
