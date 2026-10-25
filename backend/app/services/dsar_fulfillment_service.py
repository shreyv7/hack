"""DPDPA-compliant DSAR fulfillment — consent withdrawal, retention-safe erasure/masking."""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.consent_receipt import ConsentReceipt
from app.models.dsar import DataRightType, DataRightsRequest
from app.models.organization_settings import OrganizationSettings
from app.models.retention_obligation import ObligationStatus, RetentionObligation
from app.schemas.consent_banking import ConsentIdentifierInput
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.proof_vault_service import ProofVaultService
from app.utils.industry_packs import banking_pack_enabled, is_banking_industry

logger = logging.getLogger(__name__)

BANKING_IDENTIFIER_KEYS = frozenset(
    {
        "bank_customer_ref",
        "account_number",
        "mobile",
        "username",
        "email",
    }
)


class DsarFulfillmentService:
    def __init__(self, db: Session):
        self.db = db

    def fulfill_on_resolve(self, req: DataRightsRequest, org_id: UUID) -> dict[str, Any]:
        """Execute DPDPA-safe fulfillment when a request is closed. Never hard-deletes under legal hold."""
        meta: dict[str, Any] = {
            "fulfilled_at": datetime.now(timezone.utc).isoformat(),
            "dpdpa_retention_safe": True,
        }

        if req.right_type == DataRightType.withdraw_consent:
            meta.update(self._fulfill_consent_withdrawal(req, org_id))
        elif req.right_type in (DataRightType.erasure, DataRightType.masking, DataRightType.anonymization):
            meta.update(self._plan_data_action(req, org_id))
        elif req.right_type == DataRightType.correction:
            meta["action"] = "correction_logged"
            meta["note"] = "Correction routed to data steward; no automated deletion performed."

        hold = self._check_retention_hold(org_id, req)
        if hold:
            req.retention_hold_applied = True
            meta["retention_hold"] = hold
            meta["immediate_deletion_blocked"] = True
            meta["dpdpa_message"] = (
                "Personal data will not be deleted immediately where RBI, AML, fraud, taxation, "
                "or contractual retention obligations apply. Minimum evidentiary records are preserved."
            )

        req.fulfillment_metadata = meta
        return meta

    def _fulfill_consent_withdrawal(self, req: DataRightsRequest, org_id: UUID) -> dict[str, Any]:
        principal_svc = ConsentPrincipalService(self.db)
        normalized = self._extract_banking_identifiers(req, org_id)
        principal = principal_svc.find_principal_for_dsar(org_id, normalized)

        result: dict[str, Any] = {
            "action": "consent_withdrawal",
            "principal_id": str(principal.id) if principal else None,
            "receipts_updated": 0,
            "proof_vault_record_ids": [],
        }

        if principal is None:
            result["note"] = "No linked consent principal found; manual CBS/CRM withdrawal required."
            return result

        receipts = (
            self.db.query(ConsentReceipt)
            .filter(
                ConsentReceipt.organization_id == org_id,
                ConsentReceipt.principal_id == principal.id,
            )
            .order_by(ConsentReceipt.created_at.desc())
            .limit(50)
            .all()
        )

        proof_ids: list[str] = []
        updated = 0
        for receipt in receipts:
            purposes = dict(receipt.consented_purposes or {})
            non_necessary = [k for k in purposes if k != "necessary"]
            if not non_necessary or not any(purposes.get(k) for k in non_necessary):
                continue

            withdrawn = {k: (True if k == "necessary" else False) for k in purposes}
            receipt.consented_purposes = withdrawn
            receipt.proof_seal_status = "pending_withdrawal_seal"
            updated += 1

            try:
                proof_id = ProofVaultService.seal_consent_proof(
                    self.db,
                    organization_id=org_id,
                    receipt=receipt,
                    live_version=None,
                    channel=receipt.capture_channel or "data_rights_portal",
                    source=f"DSAR withdraw {req.tracking_id}",
                )
                if proof_id:
                    proof_ids.append(str(proof_id))
                    receipt.proof_vault_record_id = proof_id
            except Exception:
                logger.exception("Proof vault seal failed for withdrawal receipt %s", receipt.id)

        result["receipts_updated"] = updated
        result["proof_vault_record_ids"] = proof_ids
        return result

    def _plan_data_action(self, req: DataRightsRequest, org_id: UUID) -> dict[str, Any]:
        action_map = {
            DataRightType.erasure: "schedule_deletion",
            DataRightType.masking: "schedule_masking",
            DataRightType.anonymization: "schedule_anonymization",
        }
        subject = self._subject_ref(req)
        return {
            "action": action_map.get(req.right_type, "review"),
            "subject_ref": subject,
            "retention_obligation_queued": True,
            "note": (
                "Fulfillment queued per retention policy. Destructive actions require "
                "read-write data source integration and respect legal holds."
            ),
        }

    def _extract_banking_identifiers(
        self, req: DataRightsRequest, org_id: UUID
    ) -> dict[str, str]:
        normalized: dict[str, str] = {}
        extra = req.extra_data or {}
        for key in BANKING_IDENTIFIER_KEYS:
            val = extra.get(key)
            if val and str(val).strip():
                normalized[key] = str(val).strip()
        if req.requester_phone and "mobile" not in normalized:
            normalized["mobile"] = req.requester_phone
        if req.requester_email and "email" not in normalized:
            normalized["email"] = req.requester_email.lower().strip()

        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if settings and is_banking_industry(settings.primary_industry):
            config = settings.consent_industry_config
            if config and banking_pack_enabled(config):
                try:
                    principal_svc = ConsentPrincipalService(self.db)
                    collected, _ = principal_svc._collect_values(  # noqa: SLF001
                        config,
                        journey_key=None,
                        capture_channel="data_rights_portal",
                        bank_customer_ref=normalized.get("bank_customer_ref"),
                        identifiers=[
                            ConsentIdentifierInput(type=k, token=v)
                            for k, v in normalized.items()
                            if k not in ("email", "mobile", "bank_customer_ref")
                        ],
                        principal_email=normalized.get("email"),
                        principal_phone=normalized.get("mobile"),
                        capture_mode="online",
                    )
                    return collected
                except Exception:
                    logger.debug("Banking identifier normalization skipped for DSAR %s", req.tracking_id)
        return normalized

    @staticmethod
    def _subject_ref(req: DataRightsRequest) -> str:
        extra = req.extra_data or {}
        for key in ("bank_customer_ref", "account_number", "email"):
            if extra.get(key):
                return hashlib.sha256(str(extra[key]).encode()).hexdigest()[:32]
        if req.requester_email:
            return hashlib.sha256(req.requester_email.encode()).hexdigest()[:32]
        return req.tracking_id

    def _check_retention_hold(self, org_id: UUID, req: DataRightsRequest) -> dict[str, Any] | None:
        subject = self._subject_ref(req)
        ob = (
            self.db.query(RetentionObligation)
            .filter(
                RetentionObligation.organization_id == org_id,
                RetentionObligation.subject_ref == subject,
                RetentionObligation.status.in_(
                    [ObligationStatus.pending, ObligationStatus.on_hold, ObligationStatus.due]
                ),
            )
            .order_by(RetentionObligation.created_at.desc())
            .first()
        )
        if ob is None:
            return None
        now = datetime.now(timezone.utc)
        if ob.legal_hold_until and now < ob.legal_hold_until:
            return {
                "obligation_id": str(ob.id),
                "status": ob.status.value if hasattr(ob.status, "value") else str(ob.status),
                "legal_hold_until": ob.legal_hold_until.isoformat(),
                "reason": "RBI/AML/legal retention hold active",
            }
        return None
