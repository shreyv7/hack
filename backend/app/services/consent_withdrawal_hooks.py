"""Trigger withdrawal remediation when consent purposes are revoked."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.models.consent import Purpose
from app.models.consent_banner import ConsentBanner
from app.models.consent_receipt import ConsentReceipt
from app.models.integration_property import IntegrationProperty
from app.models.property_banner_association import PropertyBannerAssociation
from app.schemas.enforcement import ConsentDecisionRequest
from app.services.consent_decision_service import ConsentDecisionService
from app.services.consent_webhook_service import deliver_purpose_updated_webhooks
from app.services.consent_withdrawal_remediation_service import (
    WithdrawalRemediationResult,
    detect_withdrawn_purpose_keys,
)
from app.services.retention_obligation_service import RetentionObligationService


def prior_receipt_for_principal(
    db: Session,
    *,
    property_obj: IntegrationProperty,
    principal_id: UUID | None,
    session_id: str | None,
    exclude_receipt_id: UUID | None = None,
) -> ConsentReceipt | None:
    query = db.query(ConsentReceipt).filter(
        ConsentReceipt.organization_id == property_obj.organization_id,
        ConsentReceipt.property_id == property_obj.id,
    )
    if principal_id:
        query = query.filter(ConsentReceipt.principal_id == principal_id)
    elif session_id:
        query = query.filter(ConsentReceipt.session_id == session_id)
    else:
        return None
    if exclude_receipt_id:
        query = query.filter(ConsentReceipt.id != exclude_receipt_id)
    return query.order_by(desc(ConsentReceipt.created_at)).first()


def process_consent_withdrawal_remediation(
    db: Session,
    *,
    property_obj: IntegrationProperty,
    receipt: ConsentReceipt,
    current_purposes: dict[str, bool] | None,
    prior_purposes: dict[str, bool] | None = None,
) -> WithdrawalRemediationResult | None:
    """Compare prior vs current consent and run remediation for withdrawn purposes."""
    if prior_purposes is None:
        prior = prior_receipt_for_principal(
            db,
            property_obj=property_obj,
            principal_id=receipt.principal_id,
            session_id=receipt.session_id,
            exclude_receipt_id=receipt.id,
        )
        prior_purposes = prior.consented_purposes if prior and isinstance(prior.consented_purposes, dict) else {}

    withdrawn = detect_withdrawn_purpose_keys(prior_purposes, current_purposes)
    if not withdrawn:
        return None

    result = RetentionObligationService(db).handle_consent_withdrawal(
        organization_id=property_obj.organization_id,
        principal_id=receipt.principal_id,
        withdrawn_purpose_keys=withdrawn,
        receipt_id=receipt.id,
        property_id=property_obj.id,
    )

    _dispatch_purpose_updated_webhooks(
        db,
        property_obj=property_obj,
        receipt=receipt,
        withdrawn_purpose_keys=withdrawn,
    )

    return result


def _resolve_purpose_ids_by_key(db: Session, organization_id: UUID, keys: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for key in keys:
        try:
            purpose_uuid = UUID(key)
            purpose = db.get(Purpose, purpose_uuid)
            if purpose and purpose.organization_id == organization_id:
                mapping[key] = str(purpose.id)
                continue
        except ValueError:
            pass
        purpose = (
            db.query(Purpose)
            .filter(Purpose.organization_id == organization_id, Purpose.name.ilike(key))
            .first()
        )
        if purpose:
            mapping[key] = str(purpose.id)
        else:
            mapping[key] = key
    return mapping


def _dispatch_purpose_updated_webhooks(
    db: Session,
    *,
    property_obj: IntegrationProperty,
    receipt: ConsentReceipt,
    withdrawn_purpose_keys: list[str],
) -> None:
    """Fire consent.purpose_updated for each withdrawn purpose (all orgs with webhook configured)."""
    active_assoc = (
        db.query(PropertyBannerAssociation)
        .filter(
            PropertyBannerAssociation.property_id == property_obj.id,
            PropertyBannerAssociation.status == "active",
        )
        .first()
    )
    if not active_assoc:
        return

    banner = db.get(ConsentBanner, active_assoc.banner_id)
    if not banner or not banner.consent_webhook_url:
        return

    principal_fp: str | None = None
    if receipt.principal_email or receipt.principal_phone:
        try:
            payload = ConsentDecisionRequest(
                purpose_key=withdrawn_purpose_keys[0],
                principal_email=receipt.principal_email,
                principal_phone=receipt.principal_phone,
                session_id=receipt.session_id,
            )
            principal_fp = ConsentDecisionService(db)._principal_fingerprint(
                property_obj.organization_id,
                payload,
            )
        except Exception:
            principal_fp = None

    purpose_id_by_key = _resolve_purpose_ids_by_key(
        db,
        property_obj.organization_id,
        withdrawn_purpose_keys,
    )

    try:
        deliver_purpose_updated_webhooks(
            db,
            webhook_url=banner.consent_webhook_url,
            property_id=property_obj.id,
            organization_id=property_obj.organization_id,
            banner_id=str(banner.id),
            session_id=receipt.session_id,
            receipt_id=str(receipt.id),
            withdrawn_purpose_keys=withdrawn_purpose_keys,
            purpose_id_by_key=purpose_id_by_key,
            principal_fingerprint=principal_fp,
            principal_email=receipt.principal_email,
            principal_phone=receipt.principal_phone,
            signing_secret=banner.webhook_signing_secret,
            subscribed_events=banner.webhook_subscribed_events,
            bearer_token=banner.webhook_bearer_token,
        )
    except Exception as exc:
        print(f"Purpose-updated webhook dispatch failed: {exc}")
