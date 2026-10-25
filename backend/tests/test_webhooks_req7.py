"""Tests for Req 7 — consent & data-rights webhooks."""

import unittest

from app.models.dsar import DataRightType, DataRightsRequestStatus
from app.services.consent_webhook_service import resolve_consent_event_type
from app.services.dsar_webhook_service import event_type_for_status
from app.services.webhook_dispatch_core import (
    event_subscribed,
    sign_webhook_payload,
)


class ConsentEventTypeTests(unittest.TestCase):
    def test_granted(self) -> None:
        self.assertEqual(
            resolve_consent_event_type({"analytics": True, "marketing": True}),
            "consent.granted",
        )

    def test_modified_when_prior_differs(self) -> None:
        self.assertEqual(
            resolve_consent_event_type(
                {"analytics": False, "marketing": True},
                prior_purposes={"analytics": True, "marketing": True},
            ),
            "consent.modified",
        )

    def test_withdrawn_empty(self) -> None:
        self.assertEqual(resolve_consent_event_type([]), "consent.withdrawn")


class DataRightsEventTypeTests(unittest.TestCase):
    def test_withdraw_maps_to_consent_withdrawn(self) -> None:
        et = event_type_for_status(
            DataRightsRequestStatus.completed,
            DataRightType.withdraw_consent,
        )
        self.assertEqual(et, "data-rights.consent_withdrawn")

    def test_masking_completed(self) -> None:
        et = event_type_for_status(
            DataRightsRequestStatus.completed,
            DataRightType.masking,
        )
        self.assertEqual(et, "data-rights.masking_completed")


class WebhookCoreTests(unittest.TestCase):
    def test_hmac_signing(self) -> None:
        payload = b'{"event_type":"consent.granted"}'
        sig = sign_webhook_payload(payload, "test-secret", "1234567890")
        self.assertEqual(len(sig), 64)

    def test_subscription_filter(self) -> None:
        self.assertTrue(event_subscribed(None, "consent.granted"))
        self.assertFalse(
            event_subscribed(["consent.withdrawn"], "consent.granted"),
        )


if __name__ == "__main__":
    unittest.main()
