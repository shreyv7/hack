"""Extended tests for consent enforcement identity linking and suppression."""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.models.consent import LegalBasis
from app.models.enforcement import WithdrawalAction
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.consent_webhook_service import build_purpose_updated_webhook_payload
from app.services.consent_withdrawal_remediation_service import detect_withdrawn_purpose_keys
from app.services.purpose_mapping_validation import validate_purpose_data_mapping


ORG_ID = UUID("00000000-0000-0000-0000-000000000201")
PROPERTY_ID = UUID("00000000-0000-0000-0000-000000000202")


class NormalizeRawIdentifiersTests(unittest.TestCase):
    def test_normalizes_email_and_phone(self) -> None:
        svc = ConsentPrincipalService(db=None)  # type: ignore[arg-type]
        normalized = svc.normalize_raw_identifiers(
            principal_email="User@Example.COM",
            principal_phone="9876543210",
        )
        self.assertIn("email", normalized)
        self.assertIn("mobile", normalized)
        self.assertEqual(normalized["email"].lower(), "user@example.com")
        self.assertTrue(normalized["mobile"].startswith("+91"))

    def test_empty_returns_empty(self) -> None:
        svc = ConsentPrincipalService(db=None)  # type: ignore[arg-type]
        self.assertEqual(svc.normalize_raw_identifiers(), {})


class LinkPrincipalFromRawTests(unittest.TestCase):
    def test_delegates_to_link_principal(self) -> None:
        db = MagicMock()
        svc = ConsentPrincipalService(db)
        principal_id = uuid4()
        with patch.object(svc, "_link_principal", return_value=principal_id) as link:
            pid, normalized, snapshot = svc.link_principal_from_raw(
                ORG_ID,
                principal_email="test@example.com",
                channel="web",
            )
        self.assertEqual(pid, principal_id)
        self.assertIn("email", normalized)
        self.assertEqual(len(snapshot), 1)
        self.assertEqual(snapshot[0]["type"], "email")
        link.assert_called_once()


class PurposeMappingGuardrailTests(unittest.TestCase):
    def test_suppress_allowed_on_shared_field(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        validate_purpose_data_mapping(
            db,
            organization_id=ORG_ID,
            purpose_id=uuid4(),
            inventory_field_id=uuid4(),
            withdrawal_action=WithdrawalAction.suppress,
        )

    def test_mask_blocked_when_field_serves_legitimate_use(self) -> None:
        db = MagicMock()
        other_purpose_id = uuid4()
        field_id = uuid4()
        mapping = SimpleNamespace(purpose_id=other_purpose_id)
        other_purpose = SimpleNamespace(
            id=other_purpose_id,
            name="Order fulfillment",
            legal_basis=LegalBasis.legitimate_use,
        )
        db.query.return_value.filter.return_value.all.return_value = [mapping]
        db.get.return_value = other_purpose

        with self.assertRaises(HTTPException) as ctx:
            validate_purpose_data_mapping(
                db,
                organization_id=ORG_ID,
                purpose_id=uuid4(),
                inventory_field_id=field_id,
                withdrawal_action=WithdrawalAction.mask,
            )
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("suppress", str(ctx.exception.detail).lower())


class PurposeUpdatedWebhookTests(unittest.TestCase):
    def test_payload_includes_identifiers(self) -> None:
        payload = build_purpose_updated_webhook_payload(
            organization_id=str(ORG_ID),
            property_id=str(PROPERTY_ID),
            banner_id="banner-1",
            receipt_id="receipt-1",
            session_id="sess-1",
            purpose_key="marketing_sms",
            purpose_id=str(uuid4()),
            allowed=False,
            principal_fingerprint="abc" * 10 + "abcd",
            principal_email="user@example.com",
            principal_phone="+919876543210",
        )
        self.assertEqual(payload["event_type"], "consent.purpose_updated")
        self.assertFalse(payload["data"]["allowed"])
        self.assertEqual(payload["data"]["principal_email"], "user@example.com")
        self.assertEqual(payload["data"]["principal_phone"], "+919876543210")
        self.assertEqual(payload["data"]["purpose_key"], "marketing_sms")


class WithdrawalDetectionExtendedTests(unittest.TestCase):
    def test_reject_all_from_prior_grant(self) -> None:
        prior = {"marketing": True, "analytics": True, "necessary": True}
        current = {"marketing": False, "analytics": False, "necessary": True}
        withdrawn = detect_withdrawn_purpose_keys(prior, current)
        self.assertEqual(set(withdrawn), {"marketing", "analytics"})


class ConsentDecisionReceiptLookupTests(unittest.TestCase):
    """Regression: email-linked principal should be used for receipt lookup."""

    def test_latest_receipt_uses_principal_not_session_only(self) -> None:
        from app.schemas.enforcement import ConsentDecisionRequest
        from app.services.consent_decision_service import ConsentDecisionService

        db = MagicMock()
        principal = SimpleNamespace(id=uuid4())
        receipt = SimpleNamespace(
            id=uuid4(),
            consented_purposes={"marketing": False},
            created_at=None,
        )
        svc = ConsentDecisionService(db)
        property_obj = SimpleNamespace(
            organization_id=ORG_ID,
            id=PROPERTY_ID,
            enforcement_mode=SimpleNamespace(value="disabled"),
        )

        with patch.object(svc, "_normalize_identifiers", return_value={"email": "user@example.com"}):
            with patch.object(
                svc.principal_service,
                "find_principal_for_dsar",
                return_value=principal,
            ) as find_principal:
                query = MagicMock()
                db.query.return_value = query
                query.filter.return_value = query
                query.order_by.return_value.first.return_value = receipt

                result = svc._latest_receipt(
                    property_obj,
                    ConsentDecisionRequest(
                        purpose_key="marketing",
                        principal_email="user@example.com",
                        session_id="brand-new-session",
                    ),
                    "fp-test",
                )

        find_principal.assert_called_once()
        self.assertIs(result, receipt)


if __name__ == "__main__":
    unittest.main()
