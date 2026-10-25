"""Tests for Req 3 — A/B test variant assignment."""

import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.services.ab_test_service import (
    VARIANT_COOKIE,
    apply_ab_variant_to_config,
    assign_ab_variant,
    deterministic_bucket,
    is_test_concluded,
)


class AbTestServiceTests(unittest.TestCase):
    def test_deterministic_bucket_stable(self) -> None:
        a = deterministic_bucket("sess-1", "banner-1")
        b = deterministic_bucket("sess-1", "banner-1")
        self.assertEqual(a, b)
        self.assertGreaterEqual(a, 0)
        self.assertLess(a, 100)

    def test_sticky_cookie_respected(self) -> None:
        banner = SimpleNamespace(ab_test_enabled=True, ab_traffic_split=100, ab_test_started_at=datetime.now(timezone.utc), ab_test_duration_days=14)
        variant, is_new, concluded = assign_ab_variant(
            session_id="s1",
            banner_id="b1",
            banner=banner,
            sticky_cookie="B",
        )
        self.assertEqual(variant, "B")
        self.assertFalse(is_new)
        self.assertFalse(concluded)

    def test_concluded_forces_variant_a(self) -> None:
        started = datetime.now(timezone.utc) - timedelta(days=30)
        banner = SimpleNamespace(
            ab_test_enabled=True,
            ab_traffic_split=100,
            ab_test_started_at=started,
            ab_test_duration_days=14,
        )
        self.assertTrue(is_test_concluded(banner))
        variant, _, concluded = assign_ab_variant(
            session_id="s1",
            banner_id="b1",
            banner=banner,
            sticky_cookie="B",
        )
        self.assertEqual(variant, "A")
        self.assertTrue(concluded)

    def test_apply_variant_b_overrides(self) -> None:
        banner = SimpleNamespace(
            ab_test_enabled=True,
            ab_variant_theme="#000000",
            ab_variant_display_style="modal",
            ab_variant_position="center",
            ab_variant_template="classic",
            ab_variant_custom_css=".x{}",
        )
        config = apply_ab_variant_to_config({"theme": "#fff", "display_style": "banner"}, banner, "B")
        self.assertEqual(config["ab_variant"], "B")
        self.assertEqual(config["theme"], "#000000")
        self.assertEqual(config["display_style"], "modal")

    def test_variant_cookie_name(self) -> None:
        self.assertEqual(VARIANT_COOKIE, "dpdpa_ab_variant")


if __name__ == "__main__":
    unittest.main()
