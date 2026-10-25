"""Tests for Req 3 — notice approval workflow helpers."""

import unittest

from app.utils.industry_packs import (
    BANKING_INDUSTRY_LABEL,
    default_banking_banner_presets,
    is_banking_industry,
    resolve_property_journey,
)


class NoticeApprovalStatusTests(unittest.TestCase):
    def test_approval_status_values(self) -> None:
        for value in ("pending_legal", "pending_dpo", "dpo_approved", "draft", "live", "archived"):
            self.assertIsInstance(value, str)

    def test_banking_industry_detection(self) -> None:
        self.assertTrue(is_banking_industry(BANKING_INDUSTRY_LABEL))
        self.assertFalse(is_banking_industry("Retail"))

    def test_banking_publish_gate_statuses(self) -> None:
        banking_allowed = {"dpo_approved"}
        non_banking_allowed = {"draft"}
        self.assertNotIn("draft", banking_allowed)
        self.assertIn("dpo_approved", banking_allowed)
        self.assertIn("draft", non_banking_allowed)


class BankingBannerPresetTests(unittest.TestCase):
    def test_presets_include_fino_channels(self) -> None:
        presets = default_banking_banner_presets()
        for key in ("mobile_banking", "internet_banking", "web_portal", "api"):
            self.assertIn(key, presets)
            self.assertEqual(presets[key]["cta_customize"], "Manage Preferences")
            self.assertTrue(presets[key]["show_withdraw_action"])

    def test_resolve_property_journey_from_map(self) -> None:
        config = {
            "journeys": [{"key": "mobile_banking", "label": "Mobile Banking", "channel": "mobile_banking"}],
            "property_journey_map": {"prop-1": "mobile_banking"},
        }
        key, channel, label = resolve_property_journey(config, "prop-1")
        self.assertEqual(key, "mobile_banking")
        self.assertEqual(channel, "mobile_banking")
        self.assertEqual(label, "Mobile Banking")


if __name__ == "__main__":
    unittest.main()
