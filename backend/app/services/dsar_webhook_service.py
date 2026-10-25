"""Data-rights webhook payloads for CBS/CRM integration (Req 5 / Req 7)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.dsar import DataRightType, DataRightsRequest, DataRightsRequestStatus


def build_data_rights_webhook_payload(
    *,
    event_type: str,
    organization_id: str,
    request: DataRightsRequest,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fulfillment = request.fulfillment_metadata or {}
    data: dict[str, Any] = {
        "tracking_id": request.tracking_id,
        "right_type": request.right_type.value if hasattr(request.right_type, "value") else str(request.right_type),
        "status": request.status.value if hasattr(request.status, "value") else str(request.status),
        "requester_name": request.requester_name,
        "verification_status": (
            request.verification_status.value
            if hasattr(request.verification_status, "value")
            else str(request.verification_status)
        ),
        "received_at": request.received_at.isoformat() if request.received_at else None,
        "resolved_at": request.resolved_at.isoformat() if request.resolved_at else None,
        "retention_hold_applied": bool(request.retention_hold_applied),
        "dpdpa_data_minimization": True,
    }
    if request.requester_email:
        data["requester_email_hash"] = _hash_contact(request.requester_email)
    if fulfillment.get("proof_vault_record_ids"):
        data["proof_vault_record_ids"] = fulfillment["proof_vault_record_ids"]
    if fulfillment.get("principal_id"):
        data["consent_principal_id"] = fulfillment["principal_id"]
    if extra:
        data.update(extra)

    return {
        "event_id": f"evt_{uuid.uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "organization_id": organization_id,
        "data": data,
    }


def event_type_for_status(
    status: DataRightsRequestStatus,
    right_type: DataRightType,
) -> str:
    if status == DataRightsRequestStatus.completed:
        if right_type == DataRightType.withdraw_consent:
            return "data-rights.consent_withdrawn"
        if right_type == DataRightType.erasure:
            return "data-rights.erasure_completed"
        if right_type == DataRightType.masking:
            return "data-rights.masking_completed"
        if right_type == DataRightType.anonymization:
            return "data-rights.anonymization_completed"
        return "data-rights.completed"
    if status == DataRightsRequestStatus.received:
        return "data-rights.request_received"
    return "data-rights.status_changed"


def resolve_data_rights_event_type(
    request: DataRightsRequest,
    *,
    explicit: str | None = None,
) -> str:
    if explicit:
        return explicit
    return event_type_for_status(request.status, request.right_type)


def _hash_contact(value: str) -> str:
    import hashlib

    return hashlib.sha256(value.lower().strip().encode()).hexdigest()


def _webhook_config_from_org(settings) -> dict[str, Any]:
    cfg = (settings.dsar_sla_config or {}) if settings else {}
    return {
        "url": cfg.get("data_rights_webhook_url"),
        "signing_secret": cfg.get("data_rights_webhook_signing_secret"),
        "bearer_token": cfg.get("data_rights_webhook_bearer_token"),
        "subscribed_events": cfg.get("data_rights_webhook_subscribed_events"),
    }


def deliver_data_rights_webhook(
    db: Session,
    *,
    webhook_url: str,
    organization_id: UUID,
    payload: dict[str, Any],
    signing_secret: str | None = None,
    bearer_token: str | None = None,
    subscribed_events: list[str] | None = None,
) -> dict[str, Any]:
    """POST a data-rights webhook with HMAC, retries, and audit logging."""
    from app.models.integration_event import IntegrationEvent
    from app.services.consent_webhook_service import validate_webhook_url
    from app.services.webhook_dispatch_core import event_subscribed, post_webhook_with_retries

    url = validate_webhook_url(webhook_url)
    if not url:
        raise ValueError("Webhook URL is required")

    event_type = payload.get("event_type", "data-rights.event")
    if not event_subscribed(subscribed_events, event_type):
        return {
            "success": True,
            "status_code": None,
            "latency_ms": 0,
            "error": None,
            "skipped": True,
        }

    result = post_webhook_with_retries(
        url,
        payload,
        event_type=event_type,
        user_agent="ZeroShield-DataRightsWebhook/1.0",
        signing_secret=signing_secret,
        bearer_token=bearer_token,
    )

    try:
        db.add(
            IntegrationEvent(
                property_id=organization_id,
                event_type="webhook_delivered" if result["success"] else "webhook_failed",
                session_id=payload.get("data", {}).get("tracking_id"),
                url=url[:2048],
                payload={
                    "data_rights_event": event_type,
                    "status_code": result["status_code"],
                    "latency_ms": result["latency_ms"],
                    "error": result.get("error"),
                    "attempts": result.get("attempts"),
                    "webhook_payload": payload,
                },
                created_at=datetime.now(timezone.utc),
            )
        )
        db.commit()
    except Exception:
        db.rollback()

    return result
