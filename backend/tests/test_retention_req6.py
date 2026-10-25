"""Tests for Req 6 — retention actions, integration mode, evidentiary profiles."""

import unittest
from types import SimpleNamespace

from fastapi import HTTPException

from app.models.data_source import IntegrationMode
from app.models.retention import RetentionAction
from app.utils.data_source_integration import (
    assert_write_actions_allowed,
    default_integration_mode,
    effective_integration_mode,
)
from app.utils.industry_packs import (
    default_banking_retention_presets,
    default_dpdpa_evidentiary_profile,
)


class IntegrationModeTests(unittest.TestCase):
    def test_default_db_is_read_write(self) -> None:
        self.assertEqual(default_integration_mode("postgresql"), IntegrationMode.read_write)

    def test_default_api_is_discovery(self) -> None:
        self.assertEqual(default_integration_mode("rest"), IntegrationMode.discovery)

    def test_effective_mode_prefers_explicit(self) -> None:
        source = SimpleNamespace(source_type="rest", integration_mode=IntegrationMode.read_write)
        self.assertEqual(effective_integration_mode(source), IntegrationMode.read_write)

    def test_discovery_blocks_write(self) -> None:
        source = SimpleNamespace(name="CRM read replica", source_type="postgresql", integration_mode=IntegrationMode.discovery)
        with self.assertRaises(HTTPException) as ctx:
            assert_write_actions_allowed(source, action="deletion")
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertIn("discovery-only", str(ctx.exception.detail).lower())

    def test_read_write_allows_write(self) -> None:
        source = SimpleNamespace(name="Core DB", source_type="postgresql", integration_mode=IntegrationMode.read_write)
        assert_write_actions_allowed(source, action="masking")


class EvidentiaryProfileTests(unittest.TestCase):
    def test_dpdpa_profile_has_keep_fields(self) -> None:
        profile = default_dpdpa_evidentiary_profile()
        self.assertTrue(profile.get("dpdpa_minimum_record"))
        self.assertIn("proof_hash", profile.get("keep_fields", []))

    def test_banking_presets_include_actions(self) -> None:
        presets = default_banking_retention_presets()
        actions = {p["action"] for p in presets}
        self.assertIn("archive", actions)
        self.assertIn("mask", actions)
        for preset in presets:
            self.assertIn("evidentiary_profile", preset)


class RetentionActionEnumTests(unittest.TestCase):
    def test_req6_actions_exist(self) -> None:
        self.assertEqual(RetentionAction.mask.value, "mask")
        self.assertEqual(RetentionAction.pseudonymize.value, "pseudonymize")


if __name__ == "__main__":
    unittest.main()
