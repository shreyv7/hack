"""
Consent management API — full Tier 1.1 integration test.

Run from backend/:
  python -m app.scripts.test_consent_api

Covers: Purpose Registry CRUD, Notice builder lifecycle, versioning,
compliance checks, draft-from-live, archive, read-only user, superadmin org context.
"""

from __future__ import annotations

import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    for raw in _env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

BASE = os.environ.get("TEST_API_BASE", "http://127.0.0.1:8000/api")
SA_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "superadmin@zeroshield.in")
SA_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "pvashisth0711@gmail.com")
USER_EMAIL = os.environ.get("TEST_USER_EMAIL", "pranavvashisth03@gmail.com")
DEFAULT_TENANT_PASSWORD = os.environ.get("TEST_TENANT_PASSWORD", SA_PASSWORD)


class TestRunner:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        body: dict | None = None,
        params: dict | None = None,
    ) -> tuple[int, Any]:
        url = f"{BASE}{path}"
        if params:
            qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
            url = f"{url}?{qs}"
        data = None
        headers = {"Accept": "application/json"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                payload = json.loads(raw) if raw else {"detail": exc.reason}
            except json.JSONDecodeError:
                payload = {"detail": raw or exc.reason}
            return exc.code, payload

    def check(self, name: str, cond: bool, detail: str = "") -> None:
        if cond:
            print(f"  OK   {name}")
        else:
            print(f"  FAIL {name}: {detail[:400]}")
            self.failures.append(name)

    def _token_for_user_email(self, email: str) -> str | None:
        try:
            from app.core.database import SessionLocal
            from app.core.security import create_access_token
            from app.models.user import User

            db = SessionLocal()
            u = db.query(User).filter(User.email == email).first()
            db.close()
            if u is None:
                return None
            return create_access_token(
                str(u.id),
                role=u.role.value,
                org_id=u.organization_id,
            )
        except Exception:
            return None

    def login(self, email: str, password: str, *, required: bool = False) -> str | None:
        status, payload = self.request(
            "POST", "/auth/login", body={"email": email, "password": password}
        )
        if status == 200 and isinstance(payload, dict):
            return payload.get("access_token")
        if required:
            self.fail(f"login {email}", str(payload))
        return None

    def run_service_tests(self) -> None:
        print("\n1. Service layer (full lifecycle)")
        suffix = uuid.uuid4().hex[:8]
        try:
            from app.core.database import SessionLocal
            from app.models.user import User, UserRole
            from app.schemas.consent import (
                NoticeCreate,
                NoticeVersionContentUpdate,
                NoticeVersionPurposesUpdate,
                PurposeCreate,
                PurposeUpdate,
            )
            from app.services.consent_service import ConsentService

            db = SessionLocal()
            admin = db.query(User).filter(User.role == UserRole.admin).first()
            if not admin:
                self.check("admin user exists", False, "no admin in DB")
                db.close()
                return
            svc = ConsentService(db)

            # Purpose CRUD
            p1 = svc.create_purpose(
                admin,
                PurposeCreate(
                    name=f"Svc Purpose A {suffix}",
                    legal_basis="consent",
                    data_categories=["Email"],
                    retention_period="Until withdrawal",
                ),
            )
            p2 = svc.create_purpose(
                admin,
                PurposeCreate(
                    name=f"Svc Purpose B {suffix}",
                    legal_basis="legitimate_use",
                    data_categories=["IP"],
                    retention_period="3 years",
                    lia_summary="This processing is necessary for IT security purposes under DPDPA Section 7.",
                    lia_reviewed_by="DPO Office",
                ),
            )
            self.check("create purposes", p1.id and p2.id, "")

            updated = svc.update_purpose(
                admin, p1.id, PurposeUpdate(retention_period="Until withdrawal + 1y")
            )
            self.check("update purpose", updated.retention_period == "Until withdrawal + 1y", "")

            detail = svc.get_purpose(admin, p1.id)
            self.check("get purpose detail", detail.id == p1.id, "")

            purposes = svc.list_purposes(admin)
            self.check("list purposes", any(x.id == p1.id for x in purposes), "")

            # Notice create + incomplete publish blocked
            notice = svc.create_notice(
                admin,
                NoticeCreate(
                    internal_name=f"Svc Notice {suffix}",
                    display_name="Service Test Notice",
                    opening_statement="",
                    dpo_email="",
                    contact_email="",
                ),
            )
            version = notice.versions[0]
            self.check("create notice draft v1", version.status.value == "draft", "")

            svc.run_compliance_check(admin, notice.id, version.id, auto_fix=True)
            version = svc.get_notice_version(admin, notice.id, version.id)
            self.check("compliance auto-fix fills defaults", bool(version.complaint_process), "")

            try:
                svc.publish_version(admin, notice.id, version.id)
                self.check("publish blocked without purposes", False, "should have failed")
            except Exception:
                self.check("publish blocked without purposes", True, "")

            svc.update_notice_version(
                admin,
                notice.id,
                version.id,
                NoticeVersionContentUpdate(
                    opening_statement="We process your data for the stated purposes.",
                    dpo_email="dpo@test.in",
                    rights_exercise="You may withdraw consent at any time via email.",
                ),
            )
            svc.set_version_purposes(
                admin,
                notice.id,
                version.id,
                NoticeVersionPurposesUpdate(purpose_ids=[p1.id, p2.id]),
            )

            svc.update_notice_version(
                admin,
                notice.id,
                version.id,
                NoticeVersionContentUpdate(
                    rights_exercise="You may access and correct your personal data.",
                ),
            )
            pre_fix = svc.run_compliance_check(admin, notice.id, version.id, auto_fix=False)
            self.check(
                "consent without withdrawal warning",
                any(w.code == "CONSENT_WITHOUT_WITHDRAWAL" for w in pre_fix.warnings),
                "",
            )
            post_fix = svc.run_compliance_check(admin, notice.id, version.id, auto_fix=True)
            self.check(
                "auto-fix resolves withdrawal warning",
                not any(w.code == "CONSENT_WITHOUT_WITHDRAWAL" for w in post_fix.warnings),
                "",
            )
            version = svc.get_notice_version(admin, notice.id, version.id)
            self.check(
                "auto-fix appends withdrawal text",
                "withdraw" in (version.rights_exercise or "").lower(),
                "",
            )

            published = svc.publish_version(admin, notice.id, version.id)
            self.check("publish notice with purposes", published.status.value == "live", "")

            # Live immutable — patch should fail
            try:
                svc.update_notice_version(
                    admin,
                    notice.id,
                    version.id,
                    NoticeVersionContentUpdate(display_name="Hacked"),
                )
                self.check("live version immutable", False, "patch should fail")
            except Exception:
                self.check("live version immutable", True, "")

            # Draft from live
            draft = svc.create_draft_from_live(admin, notice.id)
            self.check("draft from live", draft.status.value == "draft" and draft.version_number == 2, "")

            notices = svc.list_notices(admin)
            self.check("list notices", any(n.id == notice.id for n in notices), "")

            notice_detail = svc.get_notice(admin, notice.id)
            self.check("notice version history", len(notice_detail.versions) >= 2, "")

            # Archive purpose linked to live should fail
            try:
                svc.archive_purpose(admin, p1.id)
                self.check("archive purpose on live notice blocked", False, "should fail")
            except Exception:
                self.check("archive purpose on live notice blocked", True, "")

            svc.archive_notice(admin, notice.id)
            archived = svc.get_notice(admin, notice.id)
            self.check("archive notice", archived.archived_at is not None, "")

            db.close()
        except Exception as exc:
            self.check("service layer", False, str(exc))

    def run_http_tests(self, admin: str | None, user: str | None, sa: str | None, org_id: str | None) -> None:
        print("\n2. HTTP API (admin full flow)")
        if not admin:
            print("  SKIP HTTP — no admin token")
            return

        suffix = uuid.uuid4().hex[:8]

        status, purpose = self.request(
            "POST",
            "/consent/purposes",
            token=admin,
            body={
                "name": f"HTTP Purpose {suffix}",
                "legal_basis": "consent",
                "data_categories": ["Phone", "Email"],
                "retention_period": "2 years",
            },
        )
        self.check("POST /consent/purposes", status == 201, str(purpose))
        purpose_id = purpose.get("id") if isinstance(purpose, dict) else None

        status, purposes = self.request("GET", "/consent/purposes", token=admin)
        self.check("GET /consent/purposes", status == 200 and isinstance(purposes, list), str(purposes)[:120])

        if purpose_id:
            status, pd = self.request("GET", f"/consent/purposes/{purpose_id}", token=admin)
            self.check("GET /consent/purposes/{id}", status == 200, str(pd)[:120])

            status, patched = self.request(
                "PATCH",
                f"/consent/purposes/{purpose_id}",
                token=admin,
                body={"description": "Updated via HTTP test"},
            )
            self.check("PATCH /consent/purposes/{id}", status == 200, str(patched)[:120])

        status, notice = self.request(
            "POST",
            "/consent/notices",
            token=admin,
            body={
                "internal_name": f"HTTP Notice {suffix}",
                "display_name": "HTTP Test Notice",
                "opening_statement": "Test opening.",
                "dpo_email": "dpo@test.in",
                "rights_exercise": "Withdraw consent anytime.",
                "complaint_process": "Contact DPB.",
            },
        )
        self.check("POST /consent/notices", status == 201, str(notice)[:200])
        notice_id = notice.get("id") if isinstance(notice, dict) else None
        version_id = (
            notice.get("versions", [{}])[0].get("id")
            if isinstance(notice, dict) and notice.get("versions")
            else None
        )

        status, notices = self.request("GET", "/consent/notices", token=admin)
        self.check("GET /consent/notices", status == 200, str(len(notices) if isinstance(notices, list) else notices))

        if notice_id and version_id and purpose_id:
            status, ver = self.request(
                "GET",
                f"/consent/notices/{notice_id}/versions/{version_id}",
                token=admin,
            )
            self.check("GET notice version", status == 200, str(ver)[:120])

            status, ver = self.request(
                "PATCH",
                f"/consent/notices/{notice_id}/versions/{version_id}",
                token=admin,
                body={"display_name": "HTTP Notice Updated"},
            )
            self.check("PATCH notice version (draft)", status == 200, str(ver)[:120])

            status, ver = self.request(
                "PUT",
                f"/consent/notices/{notice_id}/versions/{version_id}/purposes",
                token=admin,
                body={"purpose_ids": [purpose_id]},
            )
            self.check("PUT version purposes", status == 200, str(ver)[:120])

            status, check = self.request(
                "POST",
                f"/consent/notices/{notice_id}/versions/{version_id}/compliance-check",
                token=admin,
                params={"auto_fix": "false"},
            )
            self.check("POST compliance-check", status == 200, str(check)[:120])

            status, published = self.request(
                "POST",
                f"/consent/notices/{notice_id}/versions/{version_id}/publish",
                token=admin,
            )
            self.check("POST publish", status == 200, str(published)[:120])

            status, draft = self.request(
                "POST",
                f"/consent/notices/{notice_id}/draft-from-live",
                token=admin,
            )
            self.check("POST draft-from-live", status == 200, str(draft)[:120])

            status, detail = self.request("GET", f"/consent/notices/{notice_id}", token=admin)
            self.check("GET /consent/notices/{id}", status == 200, str(len(detail.get("versions", [])) if isinstance(detail, dict) else detail))

            status, _ = self.request(
                "POST",
                f"/consent/notices/{notice_id}/archive",
                token=admin,
            )
            self.check("POST archive notice", status == 204, str(_))

            # Archive standalone purpose (not on live notice after archive)
            status, _ = self.request("DELETE", f"/consent/purposes/{purpose_id}", token=admin)
            self.check("DELETE /consent/purposes/{id} (archive)", status == 204, str(_))

        print("\n3. HTTP API (read-only user)")
        if user:
            status, _ = self.request("GET", "/consent/purposes", token=user)
            self.check("user GET /consent/purposes", status == 200, str(_))

            status, _ = self.request(
                "POST",
                "/consent/purposes",
                token=user,
                body={"name": "Should Fail", "legal_basis": "consent"},
            )
            self.check("user POST /consent/purposes -> 403", status == 403, str(_))
        else:
            print("  SKIP user tests — no user token")

        print("\n4. HTTP API (superadmin org context)")
        if sa and org_id:
            status, _ = self.request("GET", "/consent/purposes", token=sa)
            self.check("superadmin GET /consent/purposes (no org) -> 403", status == 403, str(_))

            status, _ = self.request(
                "GET", "/consent/purposes", token=sa, params={"org_id": org_id}
            )
            self.check("superadmin GET /consent/purposes?org_id=", status == 200, str(_))
        else:
            print("  SKIP superadmin tests")

    def run(self) -> int:
        print("=== Consent Tier 1.1 — Full Test Suite ===")

        try:
            status, _ = self.request("GET", "/health")
            self.check("GET /health", status == 200, "")
        except urllib.error.URLError as exc:
            self.fail("backend reachable", str(exc))
            print("\nStart backend: uvicorn app.main:app --reload")
            return 1

        self.run_service_tests()

        admin = self.login(ADMIN_EMAIL, DEFAULT_TENANT_PASSWORD)
        if not admin:
            admin = self._token_for_user_email(ADMIN_EMAIL)
            if admin:
                print("    (admin: synthetic JWT)")

        user = self.login(USER_EMAIL, DEFAULT_TENANT_PASSWORD)
        if not user:
            user = self._token_for_user_email(USER_EMAIL)

        sa = self.login(SA_EMAIL, SA_PASSWORD) if SA_PASSWORD else None
        org_id = None
        if sa:
            status, orgs = self.request("GET", "/admin/organizations", token=sa)
            if status == 200 and isinstance(orgs, list) and orgs:
                org_id = orgs[0]["id"]

        self.run_http_tests(admin, user, sa, org_id)

        print("\n=== Summary ===")
        if self.failures:
            print(f"Failed: {len(self.failures)}")
            for f in self.failures:
                print(f"  - {f}")
            return 1
        print("All tests passed.")
        return 0


if __name__ == "__main__":
    raise SystemExit(TestRunner().run())
