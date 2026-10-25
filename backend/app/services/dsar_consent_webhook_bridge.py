"""Bridge DSAR consent withdrawal to banner consent webhooks (Req 7)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.consent_banner import ConsentBanner
from app.models.consent_receipt import ConsentReceipt
from app.models.dsar import DataRightsRequest
from app.services.consent_webhook_service import deliver_consent_webhook
from app.services.consent_withdrawal_remediation_service import detect_withdrawn_purpose_keys
from app.services.retention_obligation_service import RetentionObligationService


def dispatch_withdrawal_consent_webhooks(
    db: Session,
    *,
    org_id: UUID,
    req: DataRightsRequest,
    proof_vault_record_ids: list[str] | None = None,
) -> int:
    """Notify CRM/CBS consent endpoints when DSAR withdraws consent."""
    fulfillment = req.fulfillment_metadata or {}
    principal_id = fulfillment.get("principal_id")
    if not principal_id:
        return 0

    receipts = (
        db.query(ConsentReceipt)
        .filter(
            ConsentReceipt.organization_id == org_id,
            ConsentReceipt.principal_id == principal_id,
        )
        .order_by(ConsentReceipt.created_at.desc())
        .limit(20)
        .all()
    )
    sent = 0
    proof_id = (proof_vault_record_ids or fulfillment.get("proof_vault_record_ids") or [None])[0]

    for receipt in receipts:
        if receipt.property_id is None:
            continue
        banner_id = (receipt.banner_snapshot or {}).get("id")
        banner = db.get(ConsentBanner, banner_id) if banner_id else None
        if banner is None or not banner.consent_webhook_url:
            continue
        try:
            deliver_consent_webhook(
                db,
                webhook_url=banner.consent_webhook_url,
                property_id=receipt.property_id,
                organization_id=org_id,
                banner_id=str(banner.id),
                session_id=receipt.session_id,
                consented_purposes=[],
                language=receipt.language,
                receipt_id=str(receipt.id),
                event_type_override="consent.withdrawn",
                signing_secret=banner.webhook_signing_secret,
                subscribed_events=banner.webhook_subscribed_events,
                bearer_token=banner.webhook_bearer_token,
                principal_email=receipt.principal_email,
                banking_metadata={
                    "dsar_tracking_id": req.tracking_id,
                    "source_channel": "data_rights_portal",
                },
                proof_vault_record_id=str(proof_id) if proof_id else None,
            )
            sent += 1
        except Exception:
            continue

    # Trigger field-level remediation for mapped purposes on the latest receipt.
    if receipts:
        latest = receipts[0]
        prior_purposes = latest.consented_purposes if isinstance(latest.consented_purposes, dict) else {}
        withdrawn = detect_withdrawn_purpose_keys(prior_purposes, {})
        if withdrawn and latest.principal_id:
            RetentionObligationService(db).handle_consent_withdrawal(
                organization_id=org_id,
                principal_id=latest.principal_id,
                withdrawn_purpose_keys=withdrawn,
                receipt_id=latest.id,
                property_id=latest.property_id,
            )

    return sent
