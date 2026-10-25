from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class ConfigResponse(BaseModel):
    """The JSON response sent to cmp.js when it initializes."""
    property_id: str
    banner: dict[str, Any] | None
    purposes: list[dict[str, Any]]
    translations: dict[str, str]
    blocker_mode: str
    blocking_rules: dict[str, list[str]] = Field(default_factory=dict)
    consent_portal_email_enabled: bool = False
    consent_portal_email_label: str = "Receive your consent details on email"


class EventPayload(BaseModel):
    event_type: str = Field(..., max_length=50)
    session_id: str | None = None
    url: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
