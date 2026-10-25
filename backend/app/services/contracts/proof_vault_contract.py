import hashlib
import hmac
import json
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.consent_receipt import ConsentReceipt
from app.models.integration_property import IntegrationProperty


class ProofVaultContract:
    @staticmethod
    def store_delivery_evidence(
        db: Session,
        org_id: UUID,
        notice_id: UUID,
        notice_version_id: UUID,
        recipient_id: str,
        recipient_name: str,
        channel: str,
        status: str,
        provider_response: dict
    ) -> dict[str, str]:
        # Resolve an integration property to store with the receipt
        prop = db.query(IntegrationProperty).filter(IntegrationProperty.organization_id == org_id).first()
        property_id = prop.id if prop else UUID("00000000-0000-0000-0000-000000000000") # sandbox placeholder
        
        # Build canonical payload for hashing
        evidence_payload = {
            "org_id": str(org_id),
            "notice_id": str(notice_id),
            "notice_version_id": str(notice_version_id),
            "recipient_id": recipient_id,
            "recipient_name": recipient_name,
            "channel": channel,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
        payload_bytes = json.dumps(evidence_payload, sort_keys=True).encode()
        evidence_hash = hashlib.sha256(payload_bytes).hexdigest()
        
        signature = hmac.new(
            settings.SECRET_KEY.encode(),
            payload_bytes,
            hashlib.sha256
        ).hexdigest()
        
        # Record into ConsentReceipt table if a valid property exists
        if prop:
            receipt = ConsentReceipt(
                property_id=prop.id,
                organization_id=org_id,
                session_id=f"campaign_delivery_{recipient_id}",
                consented_purposes={"notice_delivery_evidence": True, "channel": channel, "status": status, "hash": evidence_hash},
                ip_hash=hashlib.sha256(recipient_id.encode()).hexdigest(),
                user_agent="Notice Delivery Orchestration Engine",
                language="en",
                banner_snapshot={"notice_id": str(notice_id), "version_id": str(notice_version_id), "provider_response": provider_response},
                signature=signature
            )
            db.add(receipt)
            db.flush()
            
            try:
                from app.services.proof_vault_service import ProofVaultService
                purposes_str = f"notice_delivery_evidence:{channel}"
                ProofVaultService.seal_event(
                    db,
                    org_id,
                    receipt.id,
                    event_type="notice_delivery",
                    action="DELIVERED" if status == "delivered" else status.upper(),
                    purposes=purposes_str,
                    channel=channel,
                    source=recipient_id,
                    created_at=receipt.created_at
                )
            except Exception as e:
                print(f"Failed to seal delivery evidence in Proof Vault: {e}")
        
        return {
            "evidence_hash": evidence_hash,
            "proof_vault_ref": f"proof_rec_{signature[:16]}"
        }
