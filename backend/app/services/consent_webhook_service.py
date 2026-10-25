"""Outbound consent-event webhooks for banner integrations."""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from uuid import UUID

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.consent_banner import ConsentBanner
from app.models.integration_event import IntegrationEvent

WEBHOOK_TIMEOUT_SECONDS = 10.0
MAX_WEBHOOK_URL_LENGTH = 500

WEBHOOK_DELIVERY_EVENT_TYPES = (
    "webhook_delivered",
    "webhook_failed",
    "webhook_test_delivered",
    "webhook_test_failed",
)

_HTTP_STATUS_TEXT: dict[int, str] = {
    200: "OK",
    201: "Created",
    202: "Accepted",
    204: "No Content",
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    408: "Request Timeout",
    500: "Internal Server Error",
    502: "Bad Gateway",
    503: "Service Unavailable",
    504: "Gateway Timeout",
}


def http_status_text(status_code: int | None) -> str:
    if status_code is None:
        return "No Response"
    return _HTTP_STATUS_TEXT.get(status_code, "Error")


def validate_webhook_url(url: str | None) -> str | None:
    """Return a normalized URL or None. Raises ValueError on invalid input."""
    if url is None:
        return None
    normalized = url.strip()
    if not normalized:
        return None
    if len(normalized) > MAX_WEBHOOK_URL_LENGTH:
        raise ValueError(f"Webhook URL must be at most {MAX_WEBHOOK_URL_LENGTH} characters")
    parsed = urlparse(normalized)
    if parsed.scheme not in ("http", "https"):
        raise ValueError("Webhook URL must use http or https")
    if not parsed.netloc:
        raise ValueError("Webhook URL must include a valid host")
    return normalized


def resolve_consent_event_type(
    consented_purposes: dict[str, Any] | list[str] | None,
    *,
    prior_purposes: dict[str, Any] | None = None,
) -> str:
    """Map stored consent payload to a webhook event type."""
    if prior_purposes is not None and consented_purposes is not None:
        current = consented_purposes if isinstance(consented_purposes, dict) else {}
        if current != prior_purposes:
            return "consent.modified"

    if not consented_purposes:
        return "consent.withdrawn"

    if isinstance(consented_purposes, list):
        granted = [p for p in consented_purposes if p]
        if not granted:
            return "consent.withdrawn"
        return "consent.granted"

    non_essential = [k for k, v in consented_purposes.items() if k != "necessary"]
    if not non_essential:
        return "consent.granted"

    all_accepted = all(consented_purposes.get(k, False) for k in non_essential)
    all_rejected = all(not consented_purposes.get(k, False) for k in non_essential)
    if all_accepted:
        return "consent.granted"
    if all_rejected:
        return "consent.denied"
    return "consent.partial"


def build_consent_webhook_payload(
    *,
    event_type: str,
    organization_id: str,
    property_id: str,
    banner_id: str | None,
    session_id: str | None,
    consented_purposes: dict[str, Any] | list[str] | None,
    language: str | None,
    receipt_id: str | None = None,
    is_test: bool = False,
    principal_email: str | None = None,
    banking_metadata: dict[str, Any] | None = None,
    proof_vault_record_id: str | None = None,
    proof_hash: str | None = None,
) -> dict[str, Any]:
    purposes_data: dict[str, Any] | list[str]
    if isinstance(consented_purposes, dict):
        purposes_data = consented_purposes
    elif isinstance(consented_purposes, list):
        purposes_data = consented_purposes
    else:
        purposes_data = {}

    data: dict[str, Any] = {
        "session_id": session_id,
        "platform": "website",
        "consented_purposes": purposes_data,
        "language": language or "en",
    }
    if principal_email:
        data["principal_email"] = principal_email
    if banking_metadata:
        data.update(
            {
                k: v
                for k, v in banking_metadata.items()
                if v is not None and k != "identifier_types_used"
            }
        )
        if banking_metadata.get("identifier_types_used"):
            data["identifier_types"] = banking_metadata["identifier_types_used"]

    if proof_vault_record_id:
        data["proof_vault_record_id"] = proof_vault_record_id
    if proof_hash:
        data["proof_hash"] = proof_hash

    return {
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "organization_id": organization_id,
        "property_id": property_id,
        "banner_id": banner_id,
        "receipt_id": receipt_id,
        "is_test": is_test,
        "data": data,
    }


def build_purpose_updated_webhook_payload(
    *,
    organization_id: str,
    property_id: str,
    banner_id: str | None,
    receipt_id: str | None,
    session_id: str | None,
    purpose_key: str,
    purpose_id: str,
    allowed: bool,
    principal_fingerprint: str | None = None,
    principal_email: str | None = None,
    principal_phone: str | None = None,
    occurred_at: datetime | None = None,
) -> dict[str, Any]:
    """Webhook payload when a single purpose consent state changes (e.g. marketing withdrawn)."""
    data: dict[str, Any] = {
        "session_id": session_id,
        "purpose_key": purpose_key,
        "purpose_id": purpose_id,
        "allowed": allowed,
        "occurred_at": (occurred_at or datetime.now(timezone.utc)).isoformat(),
    }
    if principal_fingerprint:
        data["principal_fingerprint"] = principal_fingerprint
    if principal_email:
        data["principal_email"] = principal_email
    if principal_phone:
        data["principal_phone"] = principal_phone

    return {
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": "consent.purpose_updated",
        "organization_id": organization_id,
        "property_id": property_id,
        "banner_id": banner_id,
        "receipt_id": receipt_id,
        "is_test": False,
        "data": data,
    }


def deliver_purpose_updated_webhooks(
    db: Session,
    *,
    webhook_url: str,
    property_id,
    organization_id,
    banner_id: str | None,
    session_id: str | None,
    receipt_id: str | None,
    withdrawn_purpose_keys: list[str],
    purpose_id_by_key: dict[str, str],
    principal_fingerprint: str | None = None,
    principal_email: str | None = None,
    principal_phone: str | None = None,
    signing_secret: str | None = None,
    subscribed_events: list[str] | None = None,
    bearer_token: str | None = None,
) -> list[dict[str, Any]]:
    """Notify org systems that specific purposes were withdrawn/suppressed."""
    from app.services.webhook_dispatch_core import event_subscribed, post_webhook_with_retries

    if not withdrawn_purpose_keys:
        return []

    url = validate_webhook_url(webhook_url)
    if not url:
        return []

    if not event_subscribed(subscribed_events, "consent.purpose_updated"):
        return [
            {
                "success": True,
                "skipped": True,
                "message": "Event consent.purpose_updated skipped (not subscribed)",
            }
        ]

    results: list[dict[str, Any]] = []
    for purpose_key in withdrawn_purpose_keys:
        purpose_id = purpose_id_by_key.get(purpose_key, purpose_key)
        payload = build_purpose_updated_webhook_payload(
            organization_id=str(organization_id),
            property_id=str(property_id),
            banner_id=banner_id,
            receipt_id=receipt_id,
            session_id=session_id,
            purpose_key=purpose_key,
            purpose_id=purpose_id,
            allowed=False,
            principal_fingerprint=principal_fingerprint,
            principal_email=principal_email,
            principal_phone=principal_phone,
        )
        result = post_webhook_with_retries(
            url,
            payload,
            event_type="consent.purpose_updated",
            user_agent="ZeroShield-ConsentWebhook/1.0",
            signing_secret=signing_secret,
            bearer_token=bearer_token,
        )
        _log_delivery(
            db,
            property_id=property_id,
            session_id=session_id,
            url=url,
            event_type="consent.purpose_updated",
            success=result["success"],
            status_code=result["status_code"],
            latency_ms=result["latency_ms"],
            payload=payload,
            error=result.get("error"),
        )
        results.append(result)
    return results


def _log_delivery(
    db: Session,
    *,
    property_id,
    session_id: str | None,
    url: str,
    event_type: str,
    success: bool,
    status_code: int | None,
    latency_ms: int,
    payload: dict[str, Any],
    error: str | None = None,
    is_test: bool = False,
) -> IntegrationEvent | None:
    try:
        if is_test:
            delivery_event_type = "webhook_test_delivered" if success else "webhook_test_failed"
        else:
            delivery_event_type = "webhook_delivered" if success else "webhook_failed"

        event = IntegrationEvent(
            property_id=property_id,
            event_type=delivery_event_type,
            session_id=session_id,
            ip_hash=None,
            user_agent="ZeroShield Webhook Dispatcher",
            url=url[:2048],
            payload={
                "consent_event_type": event_type,
                "status_code": status_code,
                "latency_ms": latency_ms,
                "error": error,
                "webhook_payload": payload,
                "is_test": is_test,
                "attempts": (payload.get("_delivery_meta") or {}).get("attempts"),
            },
            created_at=datetime.now(timezone.utc),
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception as exc:
        print(f"Failed to log webhook delivery: {exc}")
        return None


def delivery_log_from_event(event: IntegrationEvent) -> dict[str, Any]:
    payload = event.payload or {}
    status_code = payload.get("status_code")
    is_test = bool(payload.get("is_test")) or event.event_type.startswith("webhook_test_")
    success = event.event_type in ("webhook_delivered", "webhook_test_delivered")
    return {
        "id": event.id,
        "property_id": event.property_id,
        "event": payload.get("consent_event_type") or "unknown",
        "url": event.url or "",
        "status_code": status_code,
        "status_text": http_status_text(status_code),
        "latency_ms": int(payload.get("latency_ms") or 0),
        "success": success,
        "payload": payload.get("webhook_payload") or {},
        "error": payload.get("error"),
        "attempts": payload.get("attempts") or (payload.get("_delivery_meta") or {}).get("attempts"),
        "is_test": is_test,
        "created_at": event.created_at,
    }


def list_webhook_deliveries(
    db: Session,
    *,
    property_id: UUID,
    limit: int = 50,
) -> list[dict[str, Any]]:
    events = (
        db.query(IntegrationEvent)
        .filter(
            IntegrationEvent.property_id == property_id,
            IntegrationEvent.event_type.in_(WEBHOOK_DELIVERY_EVENT_TYPES),
        )
        .order_by(desc(IntegrationEvent.created_at))
        .limit(limit)
        .all()
    )
    return [delivery_log_from_event(event) for event in events]


def _test_payload_for_event(event_type: str) -> tuple[str, dict[str, Any] | list[str]]:
    if event_type == "consent.withdrawn":
        return event_type, []
    if event_type == "dpo.complaint_filed":
        return event_type, {
            "complaint_id": f"cmp_{uuid.uuid4().hex[:8]}",
            "principal_identifier": "principal_user_test",
            "nature_of_grievance": "Test grievance filed via Developer Console.",
            "urgency_level": "standard",
        }
    if event_type == "consent.granted":
        return event_type, ["analytics", "essential"]
    return event_type, {"analytics": True, "marketing": False, "functional": True}


def deliver_consent_webhook(
    db: Session,
    *,
    webhook_url: str,
    property_id,
    organization_id,
    banner_id: str | None,
    session_id: str | None,
    consented_purposes: dict[str, Any] | list[str] | None,
    language: str | None,
    receipt_id: str | None = None,
    is_test: bool = False,
    test_event_type: str | None = None,
    principal_email: str | None = None,
    banking_metadata: dict[str, Any] | None = None,
    proof_vault_record_id: str | None = None,
    proof_hash: str | None = None,
    event_type_override: str | None = None,
    prior_purposes: dict[str, Any] | None = None,
    signing_secret: str | None = None,
    subscribed_events: list[str] | None = None,
    bearer_token: str | None = None,
) -> dict[str, Any]:
    """POST a consent webhook and return delivery metadata."""
    from app.services.webhook_dispatch_core import event_subscribed, post_webhook_with_retries

    url = validate_webhook_url(webhook_url)
    if not url:
        raise ValueError("Webhook URL is required")

    if is_test:
        event_type, test_purposes = _test_payload_for_event(test_event_type or "consent.test")
        payload_purposes = test_purposes
    else:
        event_type = event_type_override or resolve_consent_event_type(
            consented_purposes, prior_purposes=prior_purposes
        )
        payload_purposes = consented_purposes

    if not is_test and not event_subscribed(subscribed_events, event_type):
        return {
            "success": True,
            "status_code": None,
            "latency_ms": 0,
            "message": f"Event {event_type} skipped (not subscribed)",
            "payload": None,
            "delivery_log_id": None,
            "skipped": True,
        }

    payload = build_consent_webhook_payload(
        event_type=event_type,
        organization_id=str(organization_id),
        property_id=str(property_id),
        banner_id=banner_id,
        session_id=session_id or f"test_{uuid.uuid4().hex[:8]}",
        consented_purposes=payload_purposes,
        language=language or "en",
        receipt_id=receipt_id,
        is_test=is_test,
        principal_email=principal_email,
        banking_metadata=banking_metadata,
        proof_vault_record_id=proof_vault_record_id,
        proof_hash=proof_hash,
    )

    if is_test and event_type == "dpo.complaint_filed":
        payload["data"] = payload_purposes

    result = post_webhook_with_retries(
        url,
        payload,
        event_type=event_type,
        user_agent="ZeroShield-ConsentWebhook/1.0",
        signing_secret=signing_secret,
        bearer_token=bearer_token,
    )
    success = result["success"]
    status_code = result["status_code"]
    error = result["error"]
    latency_ms = result["latency_ms"]
    payload["_delivery_meta"] = {"attempts": result.get("attempts", 1)}

    delivery_event = _log_delivery(
        db,
        property_id=property_id,
        session_id=session_id,
        url=url,
        event_type=event_type,
        success=success,
        status_code=status_code,
        latency_ms=latency_ms,
        payload=payload,
        error=error,
        is_test=is_test,
    )

    return {
        "success": success,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "message": "Webhook delivered successfully"
        if success
        else (error or "Webhook delivery failed"),
        "payload": payload,
        "delivery_log_id": str(delivery_event.id) if delivery_event else None,
        "attempts": result.get("attempts", 1),
    }


def redeliver_from_log(db: Session, *, delivery_log_id: UUID) -> dict[str, Any]:
    """Replay a stored webhook payload from an integration_events row."""
    from app.services.webhook_dispatch_core import post_webhook_with_retries

    event = db.get(IntegrationEvent, delivery_log_id)
    if event is None or event.event_type not in WEBHOOK_DELIVERY_EVENT_TYPES:
        raise ValueError("Delivery log not found")

    stored = event.payload or {}
    payload = stored.get("webhook_payload")
    url = event.url
    event_type = stored.get("consent_event_type") or "consent.event"
    if not payload or not url:
        raise ValueError("Stored payload or URL missing")

    result = post_webhook_with_retries(
        url,
        payload,
        event_type=event_type,
        user_agent="ZeroShield-ConsentWebhook/1.0",
    )
    _log_delivery(
        db,
        property_id=event.property_id,
        session_id=event.session_id,
        url=url,
        event_type=event_type,
        success=result["success"],
        status_code=result["status_code"],
        latency_ms=result["latency_ms"],
        payload=payload,
        error=result.get("error"),
        is_test=bool(stored.get("is_test")),
    )
    return result


def dispatch_banner_consent_webhook(
    db: Session,
    *,
    banner: ConsentBanner | None,
    property_id,
    organization_id,
    session_id: str | None,
    consented_purposes: dict[str, Any] | list[str] | None,
    language: str | None,
    receipt_id: str | None = None,
) -> None:
    """Fire webhook for a live consent event when the banner has a URL configured."""
    if not banner or not banner.consent_webhook_url:
        return
    try:
        deliver_consent_webhook(
            db,
            webhook_url=banner.consent_webhook_url,
            property_id=property_id,
            organization_id=organization_id,
            banner_id=str(banner.id),
            session_id=session_id,
            consented_purposes=consented_purposes,
            language=language,
            receipt_id=receipt_id,
            is_test=False,
            signing_secret=banner.webhook_signing_secret,
            subscribed_events=banner.webhook_subscribed_events,
            bearer_token=banner.webhook_bearer_token,
        )
    except Exception as exc:
        print(f"Consent webhook dispatch failed: {exc}")
