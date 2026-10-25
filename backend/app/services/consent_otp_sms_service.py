"""Send consent verification OTP via org SMS provider."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.integration_event import IntegrationEvent
from app.services.notice_delivery_service import ProviderRegistry

logger = logging.getLogger(__name__)


def render_consent_otp_sms(otp: str) -> str:
    return f"Your consent verification code is {otp}. Valid for 15 minutes. Do not share this code."


def send_consent_otp_sms(
    db: Session,
    *,
    organization_id: UUID,
    property_id: UUID,
    session_id: str,
    to_phone: str,
    otp: str,
    ip_hash: str = "consent-otp",
    user_agent: str | None = None,
) -> dict[str, Any]:
    sms_text = render_consent_otp_sms(otp)
    try:
        adapter = ProviderRegistry.get_adapter("sms", db, organization_id)
        result = adapter.send_notice({"phone": to_phone}, "Consent Verification", sms_text)
        if result.get("success"):
            _log_event(db, property_id, session_id, to_phone, "consent_otp_sent", ip_hash, user_agent)
            return {"success": True, "status": "delivered"}
    except Exception as exc:
        logger.info("SMS adapter unavailable for consent OTP to %s: %s", to_phone, exc)

    logger.info("Consent OTP for %s: %s", to_phone, otp)
    _log_event(db, property_id, session_id, to_phone, "consent_otp_sent", ip_hash, user_agent, simulated=True)
    return {"success": True, "status": "logged_simulated"}


def _log_event(
    db: Session,
    property_id: UUID,
    session_id: str,
    phone: str,
    event_type: str,
    ip_hash: str,
    user_agent: str | None,
    *,
    simulated: bool = False,
) -> None:
    db.add(
        IntegrationEvent(
            property_id=property_id,
            event_type=event_type,
            session_id=session_id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            payload={"phone": phone[-4:].rjust(len(phone), "*"), "simulated": simulated},
            created_at=datetime.now(timezone.utc),
        )
    )
