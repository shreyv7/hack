"""Tests for DSAR Req 5 fulfillment and DPDPA-safe retention."""

import unittest
from types import SimpleNamespace
from uuid import UUID

from app.models.dsar import DataRightType
from app.services.dsar_fulfillment_service import DsarFulfillmentService
from app.services.dsar_portal_forms import banking_enriched_form, merge_stored_form
from app.services.dsar_webhook_service import build_data_rights_webhook_payload


ORG = UUID("00000000-0000-0000-0000-000000000301")


class BankingPortalFormTests(unittest.TestCase):
    def test_banking_form_includes_cif_without_requiring_email(self) -> None:
        form = banking_enriched_form(DataRightType.withdraw_consent)
        keys = [f["key"] for f in form["fields"]]
        self.assertIn("bank_customer_ref", keys)
        self.assertIn("requester_phone", keys)
        email_field = next(f for f in form["fields"] if f["key"] == "requester_email")
        self.assertFalse(email_field["required"])

    def test_merge_stored_form_banking_default(self) -> None:
        merged = merge_stored_form(DataRightType.masking, None, banking=True)
        self.assertIn("RBI", merged["help_text"] or "")


class WebhookPayloadTests(unittest.TestCase):
    def test_webhook_excludes_raw_email(self) -> None:
        req = SimpleNamespace(
            tracking_id="DSR-001",
            right_type=DataRightType.withdraw_consent,
            status=SimpleNamespace(value="completed"),
            requester_name="Test User",
            requester_email="user@example.com",
            verification_status=SimpleNamespace(value="verified"),
            received_at=None,
            resolved_at=None,
            retention_hold_applied=True,
            fulfillment_metadata={"proof_vault_record_ids": ["abc"]},
        )
        payload = build_data_rights_webhook_payload(
            event_type="data-rights.completed",
            organization_id=str(ORG),
            request=req,
        )
        self.assertTrue(payload["data"]["dpdpa_data_minimization"])
        self.assertNotIn("user@example.com", str(payload))
        self.assertIn("requester_email_hash", payload["data"])


class SubjectRefTests(unittest.TestCase):
    def test_subject_ref_uses_hash_not_raw_cif(self) -> None:
        req = SimpleNamespace(
            tracking_id="DSR-002",
            requester_email=None,
            extra_data={"bank_customer_ref": "CIF-SECRET-123"},
        )
        ref = DsarFulfillmentService._subject_ref(req)
        self.assertNotIn("CIF", ref)
        self.assertEqual(len(ref), 32)


if __name__ == "__main__":
    unittest.main()
