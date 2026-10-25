"""Tests for vajra-python enforcement helpers."""

import os
import sys
import unittest
from pathlib import Path
from uuid import uuid4

PKG_ROOT = Path(__file__).resolve().parents[2] / "packages" / "vajra-python"
sys.path.insert(0, str(PKG_ROOT))

from vajra.config import VajraConfig  # noqa: E402
from vajra.enforcement import evaluate_consent  # noqa: E402
from vajra.token import mint_decision_token  # noqa: E402


class VajraMiddlewareTests(unittest.TestCase):
    def setUp(self) -> None:
        self.property_id = uuid4()
        self.secret = "phase4-test-secret"
        self.config = VajraConfig(
            property_id=str(self.property_id),
            decision_secret=self.secret,
            api_url="http://localhost:65535/public/v1",
            api_key="test-key",
        )

    def test_token_path_allows_without_network(self) -> None:
        from vajra.token import mint_decision_token as mint

        token, _ = mint(
            property_id=self.property_id,
            signing_secret=self.secret,
            principal_fingerprint="fp" * 16,
            purpose_rights={"marketing": True, str(uuid4()): True},
            ttl_seconds=900,
        )
        result = evaluate_consent(
            purpose_key="marketing",
            config=self.config,
            token=token,
            session_id="sess_test",
        )
        self.assertTrue(result.allowed)
        self.assertEqual(result.source, "token")
        self.assertFalse(result.should_block)


if __name__ == "__main__":
    unittest.main()
