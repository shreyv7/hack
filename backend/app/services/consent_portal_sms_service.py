"""Send consent receipt links and preferences via SMS."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.consent_receipt import ConsentReceipt
from app.models.integration_event import IntegrationEvent
from app.models.organization import Organization
from app.services.notice_delivery_service import ProviderRegistry

logger = logging.getLogger(__name__)


def build_org_portal_url(db: Session, organization_id: UUID) -> str | None:
    org = db.get(Organization, organization_id)
    if not org or not org.slug:
        return None
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/portal/{org.slug}"


def render_consent_sms_text(
    org_name: str,
    consented_purposes: dict[str, bool] | None,
    portal_url: str | None = None,
    banner_links: dict[str, str | None] | None = None,
) -> str:
    purposes = consented_purposes or {}
    granted = [k for k, v in purposes.items() if v]
    granted_str = ", ".join(granted) if granted else "Strictly Necessary"

    lines = [
        f"DPDPA Consent Receipt for {org_name}:",
        f"Consented to: {granted_str}.",
    ]

    links = banner_links or {}
    p_url = portal_url or links.get("portal_url") or links.get("withdrawal_url")
    if p_url:
        lines.append(f"Rights Portal: {p_url}")

    if links.get("privacy_policy_url"):
        lines.append(f"Privacy Policy: {links['privacy_policy_url']}")

    if links.get("cookie_policy_url"):
        lines.append(f"Cookie Policy: {links['cookie_policy_url']}")

    if links.get("withdrawal_url") and links.get("withdrawal_url") != p_url:
        lines.append(f"Withdraw Consent: {links['withdrawal_url']}")

    if links.get("dpo_email"):
        lines.append(f"DPO Contact: {links['dpo_email']}")

    return "\n".join(lines)


def send_consent_portal_link_sms(
    db: Session,
    *,
    organization_id: UUID,
    to_phone: str,
    consented_purposes: dict[str, bool] | None,
    banner_links: dict[str, str | None] | None = None,
) -> dict[str, Any]:
    org = db.get(Organization, organization_id)
    org_name = org.name if org else "Your organisation"
    portal_url = build_org_portal_url(db, organization_id)
    sms_text = render_consent_sms_text(
        org_name=org_name,
        consented_purposes=consented_purposes,
        portal_url=portal_url,
        banner_links=banner_links,
    )

    try:
        adapter = ProviderRegistry.get_adapter("sms", db, organization_id)
        result = adapter.send_notice({"phone": to_phone}, "Consent Receipt", sms_text)
        if result.get("success"):
            return {"success": True, "status": "delivered", "provider": "org_sms_adapter"}
        logger.warning(
            "Org SMS adapter returned unsuccessful status for %s: %s",
            to_phone,
            result.get("error_message"),
        )
    except Exception as exc:
        logger.info("Org SMS adapter not configured or unavailable for %s: %s", to_phone, exc)

    # Fallback / unconfigured mode: log consent receipt SMS
    logger.info("SMS receipt for %s:\n%s", to_phone, sms_text)
    return {"success": True, "status": "logged_simulated", "provider": "logger_fallback"}


def dispatch_consent_portal_sms(
    db: Session,
    *,
    property_id: UUID,
    organization_id: UUID,
    receipt_id: UUID,
    session_id: str,
    principal_phone: str,
    consented_purposes: dict[str, bool] | None,
    ip_hash: str,
    user_agent: str | None,
    banner_links: dict[str, str | None] | None = None,
) -> None:
    result = send_consent_portal_link_sms(
        db,
        organization_id=organization_id,
        to_phone=principal_phone,
        consented_purposes=consented_purposes,
        banner_links=banner_links,
    )
    status = str(result.get("status") or "failed_send")
    sent_at = datetime.now(timezone.utc) if result.get("success") else None

    receipt = db.get(ConsentReceipt, receipt_id)
    if receipt:
        receipt.portal_sms_status = status
        if sent_at:
            receipt.portal_sms_sent_at = sent_at
        db.add(receipt)

    event_type = (
        "consent_portal_sms_sent" if result.get("success") else "consent_portal_sms_failed"
    )
    db.add(
        IntegrationEvent(
            property_id=property_id,
            event_type=event_type,
            session_id=session_id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            payload={
                "receipt_id": str(receipt_id),
                "principal_phone": principal_phone,
                "status": status,
            },
            created_at=datetime.now(timezone.utc),
        )
    )
    try:
        db.commit()
    except Exception as exc:
        logger.error("Failed to commit SMS receipt status: %s", exc)
        db.rollback()
