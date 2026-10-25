"""Post-capture hooks for assisted and bank API consent flows."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.integration_event import IntegrationEvent
from app.models.integration_property import IntegrationProperty
from app.services.consent_capture_service import ConsentCaptureResult
from app.services.proof_vault_service import ProofVaultService
from app.services.tag_manager_service import TagManagerService


def proof_webhook_refs(db: Session, proof_vault_record_id: UUID | None) -> tuple[str | None, str | None]:
    if not proof_vault_record_id:
        return None, None
    from app.models.proof_vault import ProofVaultRecord

    rec = db.get(ProofVaultRecord, proof_vault_record_id)
    if rec is None:
        return str(proof_vault_record_id), None
    return str(rec.id), rec.proof_hash


def log_consent_integration_event(
    db: Session,
    *,
    property_id: UUID,
    session_id: str,
    ip_hash: str,
    user_agent: str,
    consented_purposes: dict[str, bool],
    url: str = "",
) -> None:
    purposes = consented_purposes or {}
    non_essential = [k for k, v in purposes.items() if k != "necessary"]
    if not non_essential:
        event_type = "consent_given"
    else:
        all_accepted = all(purposes.get(k, False) for k in non_essential)
        all_rejected = all(not purposes.get(k, False) for k in non_essential)
        if all_accepted:
            event_type = "consent_given"
        elif all_rejected:
            event_type = "consent_denied"
        else:
            event_type = "consent_partial"

    db.add(
        IntegrationEvent(
            property_id=property_id,
            event_type=event_type,
            session_id=session_id,
            ip_hash=ip_hash,
            user_agent=user_agent[:1024],
            url=url,
            payload={},
            created_at=datetime.now(timezone.utc),
        )
    )


def seal_consent_proof_vault(
    db: Session,
    *,
    organization_id: UUID,
    receipt,
    live_version,
    channel: str,
    source: str,
) -> UUID | None:
    return ProofVaultService.seal_consent_proof(
        db,
        organization_id=organization_id,
        receipt=receipt,
        live_version=live_version,
        channel=channel,
        source=source,
    )


def dispatch_bank_consent_webhook(
    background_tasks: BackgroundTasks,
    *,
    db: Session,
    property_obj: IntegrationProperty,
    result: ConsentCaptureResult,
    session_id: str,
    consented_purposes: dict[str, bool],
    language: str,
    receipt_id: UUID,
    proof_vault_record_id: UUID | None = None,
    proof_hash: str | None = None,
) -> None:
    active_banner = result.active_banner
    banner_id = result.banner_id
    if not active_banner or not active_banner.consent_webhook_url:
        return

    from app.core.database import SessionLocal
    from app.services.consent_webhook_service import deliver_consent_webhook

    webhook_url = active_banner.consent_webhook_url
    org_id = property_obj.organization_id
    banking_metadata = result.banking_metadata

    def _dispatch() -> None:
        bg_db = SessionLocal()
        try:
            deliver_consent_webhook(
                bg_db,
                webhook_url=webhook_url,
                property_id=property_obj.id,
                organization_id=org_id,
                banner_id=str(banner_id) if banner_id else None,
                session_id=session_id,
                consented_purposes=consented_purposes,
                language=language,
                receipt_id=str(receipt_id),
                is_test=False,
                principal_email=result.receipt.principal_email,
                banking_metadata=banking_metadata,
                proof_vault_record_id=str(proof_vault_record_id) if proof_vault_record_id else None,
                proof_hash=proof_hash,
                signing_secret=active_banner.webhook_signing_secret,
                subscribed_events=active_banner.webhook_subscribed_events,
                bearer_token=active_banner.webhook_bearer_token,
            )
        finally:
            bg_db.close()

    background_tasks.add_task(_dispatch)


def record_tag_manager_metrics(db: Session, property_id: UUID, consented_purposes: dict[str, bool]) -> None:
    try:
        TagManagerService(db).record_consent_enforcement(property_id, consented_purposes)
    except Exception as exc:
        print(f"Failed to record tag manager metrics: {exc}")
