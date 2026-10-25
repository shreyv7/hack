"""Vajra enforcement configuration (env-based)."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class VajraConfig:
    property_id: str
    decision_secret: str
    api_url: str
    api_key: str | None = None
    default_session_id: str | None = None

    @classmethod
    def from_env(cls) -> "VajraConfig":
        property_id = os.environ.get("VAJRA_PROPERTY_ID", "").strip()
        decision_secret = os.environ.get("VAJRA_DECISION_SECRET", "").strip()
        api_url = os.environ.get("VAJRA_API_URL", "").strip().rstrip("/")
        api_key = os.environ.get("VAJRA_API_KEY", "").strip() or None
        default_session_id = os.environ.get("VAJRA_DEFAULT_SESSION_ID", "").strip() or None
        if not property_id or not decision_secret:
            raise ValueError(
                "VAJRA_PROPERTY_ID and VAJRA_DECISION_SECRET are required"
            )
        if not api_url:
            api_url = "http://localhost:8002/public/v1"
        return cls(
            property_id=property_id,
            decision_secret=decision_secret,
            api_url=api_url,
            api_key=api_key,
            default_session_id=default_session_id,
        )
