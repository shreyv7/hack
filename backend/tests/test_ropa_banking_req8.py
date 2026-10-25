"""Tests for Req 8 — RoPA banking context, cross-module links, retention denormalization."""

import unittest
from types import SimpleNamespace
from uuid import uuid4

from fastapi import HTTPException

from app.services.ropa_service import RopaService
from app.utils.industry_packs import (
    default_banking_consent_config,
    default_ropa_banking_presets,
    validate_ropa_banking_context,
)


class RopaBankingPresetTests(unittest.TestCase):
    def test_presets_include_fino_journeys(self) -> None:
        presets = default_ropa_banking_presets()
        for key in ("kyc_onboarding", "branch_assisted", "merchant_payments", "web_portal"):
            self.assertIn(key, presets)
            self.assertIn("channels", presets[key])
            self.assertIn("primary_identifier", presets[key])

    def test_kyc_preset_channels(self) -> None:
        preset = default_ropa_banking_presets()["kyc_onboarding"]
        self.assertIn("mobile_banking", preset["channels"])
        self.assertEqual(preset["primary_identifier"], "bank_customer_ref")


class BankingContextValidationTests(unittest.TestCase):
    def test_valid_context_passes(self) -> None:
        ctx = {
            "channels": ["mobile_banking"],
            "identifier_types": ["bank_customer_ref", "mobile"],
            "primary_identifier": "bank_customer_ref",
            "secondary_identifiers": ["mobile"],
            "consent_journey_keys": ["mobile_banking"],
        }
        validate_ropa_banking_context(ctx, default_banking_consent_config())

    def test_unknown_channel_rejected(self) -> None:
        with self.assertRaises(HTTPException) as exc:
            validate_ropa_banking_context(
                {"channels": ["unknown_channel_xyz"]},
                default_banking_consent_config(),
            )
        self.assertEqual(exc.exception.status_code, 400)

    def test_primary_must_be_in_identifier_types(self) -> None:
        with self.assertRaises(HTTPException):
            validate_ropa_banking_context(
                {
                    "identifier_types": ["mobile"],
                    "primary_identifier": "bank_customer_ref",
                },
                default_banking_consent_config(),
            )


class RetentionDenormalizationTests(unittest.TestCase):
    def test_linked_policy_overrides_inline(self) -> None:
        service = RopaService(db=SimpleNamespace())  # type: ignore[arg-type]
        linked = SimpleNamespace(
            name="KYC records — RBI retention",
            period_value=7,
            period_unit=SimpleNamespace(value="years"),
            trigger_event=SimpleNamespace(value="contract_end"),
            legal_basis="RBI KYC Master Direction",
        )
        row = SimpleNamespace(
            retention_period="inline fallback",
            trigger_event="inline trigger",
            legal_basis="inline basis",
            retention_policy=linked,
        )
        result = service._denormalize_retention_row(row)  # type: ignore[arg-type]
        self.assertEqual(result["linked_policy_name"], "KYC records — RBI retention")
        self.assertEqual(result["effective_retention_period"], "7 years")
        self.assertEqual(result["effective_trigger_event"], "contract_end")
        self.assertEqual(result["effective_legal_basis"], "RBI KYC Master Direction")

    def test_no_link_uses_inline(self) -> None:
        service = RopaService(db=SimpleNamespace())  # type: ignore[arg-type]
        row = SimpleNamespace(
            retention_period="5 years",
            trigger_event="account close",
            legal_basis="Tax",
            retention_policy=None,
        )
        result = service._denormalize_retention_row(row)  # type: ignore[arg-type]
        self.assertIsNone(result["linked_policy_name"])
        self.assertEqual(result["effective_retention_period"], "5 years")


class DataSourceRoleTests(unittest.TestCase):
    def test_valid_roles(self) -> None:
        for role in ("primary", "replica", "archive"):
            self.assertIn(role, {"primary", "replica", "archive"})


if __name__ == "__main__":
    unittest.main()
