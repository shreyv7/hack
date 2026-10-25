"""Unit tests for consent enforcement decision logic."""

import unittest
from uuid import uuid4

from app.models.enforcement import EnforcementMode
from app.services.consent_decision_service import effective_enforcement_mode
from app.services.decision_token_service import (
    decode_decision_token,
    lookup_purpose_allowed,
    mint_decision_token,
)


class EffectiveEnforcementModeTests(unittest.TestCase):
    def test_both_disabled(self) -> None:
        self.assertEqual(
            effective_enforcement_mode(EnforcementMode.disabled, EnforcementMode.disabled),
            EnforcementMode.disabled,
        )

    def test_property_shadow_purpose_enforced(self) -> None:
        self.assertEqual(
            effective_enforcement_mode(EnforcementMode.shadow, EnforcementMode.enforced),
            EnforcementMode.shadow,
        )

    def test_property_enforced_purpose_disabled(self) -> None:
        self.assertEqual(
            effective_enforcement_mode(EnforcementMode.enforced, EnforcementMode.disabled),
            EnforcementMode.disabled,
        )

    def test_both_enforced(self) -> None:
        self.assertEqual(
            effective_enforcement_mode(EnforcementMode.enforced, EnforcementMode.enforced),
            EnforcementMode.enforced,
        )


class DecisionTokenServiceTests(unittest.TestCase):
    def test_bundle_token_round_trip(self) -> None:
        secret = "test-secret-key-for-jwt-signing-only"
        property_id = uuid4()
        principal_fp = "abc123" * 5 + "abcd"
        rights = {"marketing_sms": False, "order_fulfillment": True, str(uuid4()): False}
        token, ttl = mint_decision_token(
            property_id=property_id,
            signing_secret=secret,
            principal_fingerprint=principal_fp,
            purpose_rights=rights,
            ttl_seconds=900,
        )
        self.assertEqual(ttl, 900)
        payload = decode_decision_token(secret, token)
        self.assertIsNotNone(payload)
        assert payload is not None
        self.assertEqual(payload.property_id, property_id)
        self.assertEqual(payload.principal_fingerprint, principal_fp)
        self.assertTrue(payload.purpose_rights["order_fulfillment"])
        self.assertFalse(lookup_purpose_allowed(payload, "marketing_sms"))

    def test_wrong_secret_fails(self) -> None:
        property_id = uuid4()
        token, _ = mint_decision_token(
            property_id=property_id,
            signing_secret="secret-a",
            principal_fingerprint="fp",
            purpose_rights={"x": True},
        )
        self.assertIsNone(decode_decision_token("secret-b", token))


class WithdrawalDetectionTests(unittest.TestCase):
    def test_detect_single_withdrawal(self) -> None:
        from app.services.consent_withdrawal_remediation_service import detect_withdrawn_purpose_keys

        prior = {"marketing": True, "analytics": True}
        current = {"marketing": False, "analytics": True}
        self.assertEqual(detect_withdrawn_purpose_keys(prior, current), ["marketing"])

    def test_no_withdrawal_when_new_grant(self) -> None:
        from app.services.consent_withdrawal_remediation_service import detect_withdrawn_purpose_keys

        prior = {"marketing": False}
        current = {"marketing": True}
        self.assertEqual(detect_withdrawn_purpose_keys(prior, current), [])


if __name__ == "__main__":
    unittest.main()
