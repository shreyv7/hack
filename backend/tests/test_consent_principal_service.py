"""Unit tests for banking consent principal helpers."""

import unittest
from uuid import UUID

from fastapi import HTTPException

from app.services.consent_principal_service import ConsentPrincipalService
from app.utils.industry_packs import default_banking_consent_config


ORG_ID = UUID("00000000-0000-0000-0000-000000000101")


class ConsentPrincipalServiceTests(unittest.TestCase):
    def test_fingerprint_is_stable_and_org_scoped(self) -> None:
        fp1 = ConsentPrincipalService.fingerprint(ORG_ID, "mobile", "+919876543210")
        fp2 = ConsentPrincipalService.fingerprint(ORG_ID, "mobile", "+919876543210")
        other_org = ConsentPrincipalService.fingerprint(
            UUID("00000000-0000-0000-0000-000000000102"),
            "mobile",
            "+919876543210",
        )
        self.assertEqual(fp1, fp2)
        self.assertNotEqual(fp1, other_org)

    def test_sensitive_token_guard_rejects_raw_digits(self) -> None:
        svc = ConsentPrincipalService(db=None)  # type: ignore[arg-type]
        cfg = default_banking_consent_config()
        cif_type = next(t for t in cfg["identifier_types"] if t["key"] == "bank_customer_ref")

        with self.assertRaises(HTTPException) as ctx:
            svc._guard_sensitive_token(cif_type, "12345678901234")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_sensitive_token_guard_allows_opaque_token(self) -> None:
        svc = ConsentPrincipalService(db=None)  # type: ignore[arg-type]
        cfg = default_banking_consent_config()
        cif_type = next(t for t in cfg["identifier_types"] if t["key"] == "bank_customer_ref")
        svc._guard_sensitive_token(cif_type, "cif_tok_abc123xyz")


if __name__ == "__main__":
    unittest.main()
