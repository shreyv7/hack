"""Send data-rights portal links after consent banner acceptance."""

from __future__ import annotations

import html
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.integration_event import IntegrationEvent
from app.models.notice_delivery import NoticeDeliveryProvider
from app.models.organization import Organization
from app.models.organization_settings import OrganizationSettings
from app.schemas.notice_delivery import ConsentPortalEmailConfig
from app.services.consent_webhook_service import resolve_consent_event_type
from app.services.dsar_email import _send_email
from app.services.notice_delivery_serializers import build_dp_notification_auto_config
from app.services.notice_delivery_service import ProviderRegistry
from app.services.notice_provider_validation import configured_provider_for_channel

logger = logging.getLogger(__name__)

DEFAULT_EMAIL_FIELD_LABEL = "Receive your consent details on email"


def _normalize_config(raw: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"enabled": False, "email_field_label": DEFAULT_EMAIL_FIELD_LABEL}
    label = str(raw.get("email_field_label") or DEFAULT_EMAIL_FIELD_LABEL).strip()
    if not label:
        label = DEFAULT_EMAIL_FIELD_LABEL
    return {
        "enabled": bool(raw.get("enabled")),
        "email_field_label": label[:200],
    }


def load_consent_portal_email_config(
    settings_row: OrganizationSettings | None,
) -> dict[str, Any]:
    return _normalize_config(settings_row.consent_portal_email_config if settings_row else None)


def email_provider_ready(providers: list[NoticeDeliveryProvider]) -> bool:
    return configured_provider_for_channel(providers, "email") is not None


def build_org_portal_url(db: Session, organization_id: UUID) -> str | None:
    org = db.get(Organization, organization_id)
    if not org or not org.slug:
        return None
    base = settings.FRONTEND_URL.rstrip("/")
    return f"{base}/portal/{org.slug}"


def build_consent_portal_email_config(
    db: Session,
    organization_id: UUID,
    settings_row: OrganizationSettings | None,
) -> ConsentPortalEmailConfig:
    stored = load_consent_portal_email_config(settings_row)
    providers = (
        db.query(NoticeDeliveryProvider)
        .filter(NoticeDeliveryProvider.organization_id == organization_id)
        .all()
    )
    auto = build_dp_notification_auto_config(providers, settings_row)
    return ConsentPortalEmailConfig(
        enabled=stored["enabled"],
        email_field_label=stored["email_field_label"],
        email_provider_ready=auto.dispatch_ready,
        portal_url=build_org_portal_url(db, organization_id),
    )


def get_public_banner_email_config(
    db: Session,
    organization_id: UUID,
) -> tuple[bool, str]:
    settings_row = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == organization_id)
        .first()
    )
    cfg = build_consent_portal_email_config(db, organization_id, settings_row)
    if not cfg.enabled or not cfg.email_provider_ready:
        return False, cfg.email_field_label
    return True, cfg.email_field_label


def update_consent_portal_email_config(
    db: Session,
    organization_id: UUID,
    *,
    enabled: bool | None = None,
    email_field_label: str | None = None,
) -> ConsentPortalEmailConfig:
    settings_row = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == organization_id)
        .first()
    )
    if not settings_row:
        settings_row = OrganizationSettings(organization_id=organization_id)
        db.add(settings_row)
        db.flush()

    current = load_consent_portal_email_config(settings_row)
    if enabled is not None:
        current["enabled"] = enabled
    if email_field_label is not None:
        label = email_field_label.strip() or DEFAULT_EMAIL_FIELD_LABEL
        current["email_field_label"] = label[:200]

    settings_row.consent_portal_email_config = current
    db.add(settings_row)
    db.commit()
    db.refresh(settings_row)
    return build_consent_portal_email_config(db, organization_id, settings_row)


def should_send_portal_email(
    *,
    enabled: bool,
    principal_email: str | None,
    consented_purposes: dict[str, bool] | None,
) -> bool:
    if not enabled or not principal_email:
        return False
    event_type = resolve_consent_event_type(consented_purposes or {})
    return event_type in ("consent.granted", "consent.partial")


def _render_email(org_name: str, portal_url: str) -> tuple[str, str, str]:
    safe_org = html.escape(org_name)
    safe_url = html.escape(portal_url, quote=True)
    subject = f"Your consent record and data rights — {org_name}"
    text_body = (
        f"Thank you for providing your consent preferences to {org_name}.\n\n"
        "You can review your data rights and exercise them at any time using your "
        "organisation's public data-rights portal:\n"
        f"{portal_url}\n\n"
        f"— {org_name}"
    )
    html_body = (
        f"<p>Thank you for providing your consent preferences to <strong>{safe_org}</strong>.</p>"
        f"<p>You can review your data rights and exercise them at any time using your "
        f"organisation's public data-rights portal:</p>"
        f'<p><a href="{safe_url}">{html.escape(portal_url)}</a></p>'
        f"<p>— {safe_org}</p>"
    )
    return subject, text_body, html_body


def send_consent_portal_link_email(
    db: Session,
    *,
    organization_id: UUID,
    to_email: str,
    consented_purposes: dict[str, bool] | None,
) -> dict[str, Any]:
    settings_row = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == organization_id)
        .first()
    )
    stored = load_consent_portal_email_config(settings_row)
    if not stored["enabled"]:
        return {"success": False, "status": "skipped_disabled"}

    if not should_send_portal_email(
        enabled=stored["enabled"],
        principal_email=to_email,
        consented_purposes=consented_purposes,
    ):
        return {"success": False, "status": "skipped_not_eligible"}

    portal_url = build_org_portal_url(db, organization_id)
    if not portal_url:
        return {"success": False, "status": "failed_no_portal_url"}

    org = db.get(Organization, organization_id)
    org_name = org.name if org else "Your organisation"
    subject, text_body, html_body = _render_email(org_name, portal_url)

    try:
        adapter = ProviderRegistry.get_adapter("email", db, organization_id)
        result = adapter.send_notice({"email": to_email}, subject, html_body)
        if result.get("success"):
            return {"success": True, "status": "delivered", "provider": "org_adapter"}
        logger.warning(
            "Org email adapter failed for consent portal link to %s: %s",
            to_email,
            result.get("error_message"),
        )
    except Exception as exc:
        logger.warning("Org email adapter unavailable for consent portal link: %s", exc)

    sent = _send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        html_body=html_body,
    )
    if sent:
        return {"success": True, "status": "delivered", "provider": "platform_smtp"}
    return {"success": False, "status": "failed_send"}


def dispatch_consent_portal_email(
    db: Session,
    *,
    property_id: UUID,
    organization_id: UUID,
    receipt_id: UUID,
    session_id: str,
    principal_email: str,
    consented_purposes: dict[str, bool] | None,
    ip_hash: str,
    user_agent: str | None,
) -> None:
    from app.models.consent_receipt import ConsentReceipt

    result = send_consent_portal_link_email(
        db,
        organization_id=organization_id,
        to_email=principal_email,
        consented_purposes=consented_purposes,
    )
    status = str(result.get("status") or "failed_send")
    sent_at = datetime.now(timezone.utc) if result.get("success") else None

    receipt = db.get(ConsentReceipt, receipt_id)
    if receipt:
        receipt.portal_email_status = status
        if sent_at:
            receipt.portal_email_sent_at = sent_at
        db.add(receipt)

    event_type = "consent_portal_email_sent" if result.get("success") else "consent_portal_email_failed"
    db.add(
        IntegrationEvent(
            property_id=property_id,
            event_type=event_type,
            session_id=session_id,
            ip_hash=ip_hash,
            user_agent=(user_agent or "")[:1024],
            url=None,
            payload={
                "receipt_id": str(receipt_id),
                "principal_email": principal_email,
                "status": status,
            },
            created_at=datetime.now(timezone.utc),
        )
    )
    db.commit()
