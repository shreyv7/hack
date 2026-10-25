"""Tests for Proof Vault v2 DPDPA-compliant payloads and chain integrity."""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

from app.services.proof_vault_payload import (
    PAYLOAD_VERSION_V2,
    build_consent_proof_payload,
    compute_proof_hash,
    resolve_consent_action,
)
from app.services.proof_vault_service import ProofVaultService


ORG_ID = UUID("00000000-0000-0000-0000-000000000201")
RECEIPT_ID = UUID("00000000-0000-0000-0000-000000000202")


def _sample_receipt(**overrides):
    now = datetime(2026, 7, 22, 12, 0, 0, tzinfo=timezone.utc)
    data = {
        "id": RECEIPT_ID,
        "property_id": uuid4(),
        "organization_id": ORG_ID,
        "session_id": "sess-001",
        "consented_purposes": {"marketing": True, "analytics": False, "necessary": True},
        "ip_hash": "abc",
        "user_agent": "test",
        "language": "hi",
        "banner_snapshot": {},
        "signature": "sig" * 10 + "abcd",
        "created_at": now,
        "capture_channel": "branch",
        "journey_key": "branch_assisted",
        "notice_version_id": uuid4(),
        "identifier_snapshot": [
            {"type": "bank_customer_ref", "fingerprint": "f" * 64},
            {"type": "mobile", "fingerprint": "m" * 64},
        ],
        "bank_customer_ref": None,
    }
    data.update(overrides)
    return SimpleNamespace(**data)


class ProofPayloadTests(unittest.TestCase):
    def test_payload_excludes_raw_cif(self) -> None:
        receipt = _sample_receipt(bank_customer_ref="CIF12345")
        payload = build_consent_proof_payload(
            receipt,
            org_id=ORG_ID,
            event_type="consent_grant",
            action="PARTIAL",
            purposes_str="marketing",
            channel="branch",
            source="assisted_capture",
        )
        serialized = str(payload)
        self.assertNotIn("CIF12345", serialized)
        self.assertEqual(payload["payload_version"], PAYLOAD_VERSION_V2)
        self.assertTrue(payload["dpdpa_data_minimization"])
        self.assertEqual(payload["identifier_fingerprints"][0]["fingerprint"], "f" * 64)

    def test_proof_hash_stable_for_same_payload(self) -> None:
        receipt = _sample_receipt()
        payload = build_consent_proof_payload(
            receipt,
            org_id=ORG_ID,
            event_type="consent_grant",
            action="ACCEPT",
            purposes_str="marketing",
            channel="branch",
            source="test",
        )
        h1 = compute_proof_hash(payload)
        h2 = compute_proof_hash(payload)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

    def test_resolve_consent_action_partial(self) -> None:
        self.assertEqual(
            resolve_consent_action({"marketing": True, "analytics": False}, event_type="consent_grant"),
            "PARTIAL",
        )

    def test_resolve_consent_action_noticed(self) -> None:
        self.assertEqual(resolve_consent_action({}, event_type="notice_of_processing"), "NOTICED")


class ChainHashTests(unittest.TestCase):
    def test_v1_and_v2_hashes_differ(self) -> None:
        created = datetime(2026, 1, 1, tzinfo=timezone.utc)
        v1 = ProofVaultService._chain_hash_v1(
            block_number=1,
            previous_hash="0" * 64,
            event_type="consent_grant",
            action="ACCEPT",
            purposes="marketing",
            channel="web",
            source="test",
            created_at=created,
        )
        v2 = ProofVaultService._chain_hash_v2(
            block_number=1,
            previous_hash="0" * 64,
            proof_hash="a" * 64,
            event_type="consent_grant",
            action="ACCEPT",
            purposes="marketing",
            channel="web",
            source="test",
            created_at=created,
        )
        self.assertNotEqual(v1, v2)

    def test_merkle_root_single_leaf(self) -> None:
        root = ProofVaultService.compute_merkle_root(["abc123"])
        self.assertEqual(root, "abc123")


if __name__ == "__main__":
    unittest.main()
