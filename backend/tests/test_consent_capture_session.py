"""Tests for assisted consent capture sessions and OTP helpers."""

import unittest
from uuid import UUID

from fastapi import HTTPException

from app.services.consent_capture_session_service import ConsentCaptureSessionService
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.otp_service import OtpService
from app.utils.industry_packs import default_banking_consent_config, journey_requires_otp


ORG_ID = UUID("00000000-0000-0000-0000-000000000101")


class OtpServiceTests(unittest.TestCase):
    def test_verified_token_roundtrip(self) -> None:
        session_id = "abc-123"
        token = OtpService.create_verified_token(session_id)
        OtpService.validate_verified_token(token, session_id)

    def test_verified_token_rejects_wrong_session(self) -> None:
        token = OtpService.create_verified_token("session-a")
        with self.assertRaises(HTTPException):
            OtpService.validate_verified_token(token, "session-b")

    def test_parse_verified_token_session_id(self) -> None:
        sid = "00000000-0000-0000-0000-000000000099"
        token = OtpService.create_verified_token(sid)
        self.assertEqual(OtpService.parse_verified_token_session_id(token), sid)


class BankingJourneyConfigTests(unittest.TestCase):
    def test_branch_assisted_requires_otp_by_default(self) -> None:
        cfg = default_banking_consent_config()
        self.assertTrue(journey_requires_otp(cfg, "branch_assisted"))
        self.assertTrue(journey_requires_otp(cfg, "merchant"))
        self.assertFalse(journey_requires_otp(cfg, "mobile_banking"))

    def test_mask_mobile(self) -> None:
        masked = ConsentCaptureSessionService._mask_mobile("+919876543210")
        self.assertTrue(masked.endswith("3210"))
        self.assertIn("*", masked or "")


class ConsentPrincipalOfflineTests(unittest.TestCase):
    def test_offline_blocks_disallowed_identifier(self) -> None:
        svc = ConsentPrincipalService(db=None)  # type: ignore[arg-type]
        cfg = default_banking_consent_config()
        cfg["identifier_types"] = [
            {
                "key": "email",
                "label": "Email",
                "storage": "email",
                "enabled": True,
                "sensitive": False,
                "allow_offline_capture": False,
            }
        ]
        cfg["journeys"] = [
            {
                "key": "branch_assisted",
                "label": "Branch",
                "channel": "branch",
                "attributes": {"email": "required"},
            }
        ]
        with self.assertRaises(HTTPException) as ctx:
            svc._collect_values(  # noqa: SLF001
                cfg,
                "branch_assisted",
                "branch",
                None,
                [],
                "test@example.com",
                None,
                capture_mode="offline",
            )
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
