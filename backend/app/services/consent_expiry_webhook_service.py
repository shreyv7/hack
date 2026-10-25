"""Emit consent.expired webhooks when banner validity period elapses (Req 7)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.consent_banner import ConsentBanner
from app.models.consent_receipt import ConsentReceipt
from app.services.consent_webhook_service import deliver_consent_webhook


def process_expired_consents(db: Session, *, organization_id: UUID | None = None) -> dict[str, int]:
    """Scan receipts past banner.consent_valid_days and dispatch consent.expired once."""
    now = datetime.now(timezone.utc)
    q = db.query(ConsentReceipt).filter(ConsentReceipt.expiry_webhook_sent_at.is_(None))
    if organization_id is not None:
        q = q.filter(ConsentReceipt.organization_id == organization_id)

    receipts = q.limit(500).all()
    dispatched = 0
    skipped = 0

    for receipt in receipts:
        banner_id = (receipt.banner_snapshot or {}).get("id")
        if not banner_id:
            skipped += 1
            continue
        banner = db.get(ConsentBanner, banner_id)
        if banner is None or not banner.consent_webhook_url:
            skipped += 1
            continue

        valid_days = banner.consent_valid_days or 365
        created = receipt.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        if now < created + timedelta(days=valid_days):
            skipped += 1
            continue

        property_id = receipt.property_id
        if property_id is None:
            skipped += 1
            continue

        try:
            deliver_consent_webhook(
                db,
                webhook_url=banner.consent_webhook_url,
                property_id=property_id,
                organization_id=receipt.organization_id,
                banner_id=str(banner.id),
                session_id=receipt.session_id,
                consented_purposes=receipt.consented_purposes,
                language=receipt.language,
                receipt_id=str(receipt.id),
                event_type_override="consent.expired",
                signing_secret=banner.webhook_signing_secret,
                subscribed_events=banner.webhook_subscribed_events,
                bearer_token=banner.webhook_bearer_token,
                principal_email=receipt.principal_email,
                proof_vault_record_id=(
                    str(receipt.proof_vault_record_id) if receipt.proof_vault_record_id else None
                ),
            )
            receipt.expiry_webhook_sent_at = now
            dispatched += 1
        except Exception:
            skipped += 1

    db.commit()
    return {"scanned": len(receipts), "dispatched": dispatched, "skipped": skipped}
