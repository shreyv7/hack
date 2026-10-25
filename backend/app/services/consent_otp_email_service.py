"""Send consent verification OTP via org email provider."""

from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.integration_event import IntegrationEvent
from app.services.notice_delivery_service import ProviderRegistry

logger = logging.getLogger(__name__)


def render_consent_otp_email(otp: str, org_name: str) -> tuple[str, str, str]:
    subject = f"Your consent verification code — {org_name}"
    safe_otp = html.escape(otp)
    safe_org = html.escape(org_name)
    html_body = (
        f"<p>Your consent verification code for <strong>{safe_org}</strong> is:</p>"
        f"<p style=\"font-size:24px;font-weight:bold;letter-spacing:4px\">{safe_otp}</p>"
        f"<p>This code is valid for 15 minutes. Do not share it with anyone.</p>"
    )
    text_body = f"Your consent verification code for {org_name} is {otp}. Valid for 15 minutes."
    return subject, html_body, text_body


def send_consent_otp_email(
    db: Session,
    *,
    organization_id: UUID,
    property_id: UUID,
    session_id: str,
    to_email: str,
    otp: str,
    org_name: str,
    ip_hash: str = "consent-otp",
    user_agent: str | None = None,
) -> dict[str, Any]:
    subject, html_body, _ = render_consent_otp_email(otp, org_name)
    try:
        adapter = ProviderRegistry.get_adapter("email", db, organization_id)
        result = adapter.send_notice({"email": to_email}, subject, html_body)
        if result.get("success"):
            _log_event(db, property_id, session_id, to_email, "consent_otp_email_sent", ip_hash, user_agent)
            return {"success": True, "status": "delivered"}
    except Exception as exc:
        logger.info("Email adapter unavailable for consent OTP to %s: %s", to_email, exc)

    logger.info("Consent OTP email for %s: %s", to_email, otp)
    _log_event(db, property_id, session_id, to_email, "consent_otp_email_sent", ip_hash, user_agent, simulated=True)
    return {"success": True, "status": "logged_simulated"}


def _log_event(
    db: Session,
    property_id: UUID,
    session_id: str,
    email: str,
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
            user_agent=(user_agent or "")[:1024],
            url="",
            payload={"email": email[:3] + "***", "simulated": simulated},
            created_at=datetime.now(timezone.utc),
        )
    )
