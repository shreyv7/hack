"""DPDPA-compliant canonical proof payloads for Proof Vault v2.

Data minimization (DPDPA Sec. 6 / principle of storage limitation):
- Customer identifiers are stored as HMAC fingerprints only — never raw CIF, phone, or email.
- Notice content is referenced by version ID, not full text in the cryptographic hash.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.models.consent import ConsentNoticeVersion, LegalBasis
from app.models.consent_receipt import ConsentReceipt
from app.services.consent_principal_service import ConsentPrincipalService


PAYLOAD_VERSION_V1 = 1
PAYLOAD_VERSION_V2 = 2


def _customer_ref_fingerprint(org_id: UUID, receipt: ConsentReceipt) -> str | None:
    """Derive opaque customer ref fingerprint without storing raw CIF in proof JSON."""
    if receipt.identifier_snapshot:
        for item in receipt.identifier_snapshot:
            if item.get("type") == "bank_customer_ref" and item.get("fingerprint"):
                return str(item["fingerprint"])
    if receipt.bank_customer_ref and receipt.bank_customer_ref.strip():
        return ConsentPrincipalService.fingerprint(
            org_id, "bank_customer_ref", receipt.bank_customer_ref.strip()
        )
    if receipt.identifier_snapshot:
        first = receipt.identifier_snapshot[0]
        if first.get("fingerprint"):
            return str(first["fingerprint"])
    return None


def _identifier_fingerprints(receipt: ConsentReceipt) -> list[dict[str, str]]:
    if not receipt.identifier_snapshot:
        return []
    return [
        {"type": str(i.get("type", "")), "fingerprint": str(i.get("fingerprint", ""))}
        for i in receipt.identifier_snapshot
        if i.get("type") and i.get("fingerprint")
    ]


def resolve_consent_action(consented_purposes: dict[str, bool], *, event_type: str) -> str:
    if event_type == "notice_of_processing":
        return "NOTICED"
    purposes = consented_purposes or {}
    non_necessary = {k: v for k, v in purposes.items() if k != "necessary"}
    if not non_necessary:
        return "ACCEPT" if purposes.get("necessary") else "REJECT"
    granted = [k for k, v in non_necessary.items() if v]
    rejected = [k for k, v in non_necessary.items() if not v]
    if granted and rejected:
        return "PARTIAL"
    if granted:
        return "ACCEPT"
    return "REJECT"


def build_consent_proof_payload(
    receipt: ConsentReceipt,
    *,
    org_id: UUID,
    event_type: str,
    action: str,
    purposes_str: str,
    channel: str,
    source: str,
    live_version: ConsentNoticeVersion | None = None,
) -> dict[str, Any]:
    created_at = receipt.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    payload: dict[str, Any] = {
        "payload_version": PAYLOAD_VERSION_V2,
        "consent_receipt_id": str(receipt.id),
        "notice_version_id": str(receipt.notice_version_id) if receipt.notice_version_id else None,
        "timestamp": created_at.isoformat(),
        "language": receipt.language,
        "source_channel": channel or receipt.capture_channel or "web",
        "journey_key": receipt.journey_key,
        "consent_purposes": purposes_str,
        "consented_purposes": receipt.consented_purposes or {},
        "action": action,
        "event_type": event_type,
        "customer_ref_fingerprint": _customer_ref_fingerprint(org_id, receipt),
        "identifier_fingerprints": _identifier_fingerprints(receipt),
        "principal_id": str(receipt.principal_id) if getattr(receipt, "principal_id", None) else None,
        "receipt_signature": receipt.signature,
        "capture_source": source[:256] if source else None,
        "dpdpa_data_minimization": True,
    }
    if live_version and live_version.notice_id:
        payload["notice_id"] = str(live_version.notice_id)
    return payload


def canonical_json(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def compute_proof_hash(payload: dict[str, Any]) -> str:
    return hashlib.sha256(canonical_json(payload).encode()).hexdigest()


def purpose_strings_for_receipt(
    receipt: ConsentReceipt,
    live_version: ConsentNoticeVersion | None,
    *,
    basis_filter: LegalBasis | None = None,
) -> tuple[str, str, str]:
    """Return (consent_pids_str, legit_pids_str, primary_action)."""
    consented_pids = [pid for pid, val in (receipt.consented_purposes or {}).items() if val]
    purpose_basis_map: dict[str, LegalBasis] = {}
    if live_version:
        for p in live_version.purposes:
            purpose_basis_map[str(p.purpose_id)] = p.legal_basis
            purpose_basis_map[p.name] = p.legal_basis

    consent_pids = [
        pid for pid in consented_pids if purpose_basis_map.get(pid, LegalBasis.consent) == LegalBasis.consent
    ]
    legit_pids = [pid for pid in consented_pids if purpose_basis_map.get(pid) == LegalBasis.legitimate_use]

    if basis_filter == LegalBasis.consent:
        action = resolve_consent_action(receipt.consented_purposes or {}, event_type="consent_grant")
        return "+".join(consent_pids) if consent_pids else "none", "", action
    if basis_filter == LegalBasis.legitimate_use:
        return "", "+".join(legit_pids) if legit_pids else "none", "NOTICED"

    action = resolve_consent_action(receipt.consented_purposes or {}, event_type="consent_grant")
    return (
        "+".join(consent_pids) if consent_pids else "none",
        "+".join(legit_pids) if legit_pids else "",
        action,
    )
