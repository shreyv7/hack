"""
Workspace settings API integration test.

Run from backend/ with venv active:
  python -m app.scripts.test_workspace_api

Optional env overrides:
  TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD
  TEST_USER_EMAIL, TEST_USER_PASSWORD
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

# Load .env from backend root
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
# Default tenant passwords — override via env if different
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
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            raw = exc.read().decode("utf-8")
            try:
                payload = json.loads(raw) if raw else {"detail": exc.reason}
            except json.JSONDecodeError:
                payload = {"detail": raw or exc.reason}
            return exc.code, payload

    def ok(self, name: str) -> None:
        print(f"  OK   {name}")

    def fail(self, name: str, detail: str = "") -> None:
        print(f"  FAIL {name}" + (f": {detail[:300]}" if detail else ""))
        self.failures.append(name)

    def check(self, name: str, cond: bool, detail: str = "") -> None:
        if cond:
            self.ok(name)
        else:
            self.fail(name, detail)

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

    def login(self, email: str, password: str, *, required: bool = True) -> str | None:
        status, payload = self.request(
            "POST", "/auth/login", body={"email": email, "password": password}
        )
        if status != 200:
            if required:
                self.fail(f"login {email}", str(payload))
            else:
                print(f"  WARN login {email} failed (password may differ from SUPERADMIN_PASSWORD)")
            return None
        return payload["access_token"]

    def run(self) -> int:
        print("=== DPDPA Workspace API Tests ===\n")

        print("1. Health")
        try:
            status, _ = self.request("GET", "/health")
            self.check("GET /health", status == 200)
        except urllib.error.URLError as exc:
            self.fail("GET /health", str(exc))
            print("\nStart backend: uvicorn app.main:app --reload")
            return 1

        if not SA_PASSWORD:
            self.fail("SUPERADMIN_PASSWORD", "Set in backend/.env")
            return 1

        print("\n2. Superadmin")
        sa = self.login(SA_EMAIL, SA_PASSWORD)
        if not sa:
            return 1

        status, orgs = self.request("GET", "/admin/organizations", token=sa)
        self.check("GET /admin/organizations", status == 200, str(orgs))
        if not isinstance(orgs, list) or not orgs:
            self.fail("organizations exist")
            return 1
        org_id = orgs[0]["id"]

        status, body = self.request("GET", "/workspace", token=sa)
        self.check("superadmin GET /workspace (no org) -> 403", status == 403, str(body))

        status, ws_fields = self.request(
            "GET", "/workspace", token=sa, params={"org_id": org_id}
        )
        self.check("superadmin GET /workspace?org_id=", status == 200, str(ws_fields))
        self.check(
            "workspace has organization + deployment_model",
            isinstance(ws_fields, dict)
            and "organization" in ws_fields
            and "deployment_model" in ws_fields,
        )

        status, obligations = self.request("GET", "/workspace/obligations", token=sa)
        self.check(
            "GET /workspace/obligations",
            status == 200 and isinstance(obligations, list) and len(obligations) >= 9,
            str(obligations)[:200],
        )

        print("\n3. Org admin")
        admin = self.login(ADMIN_EMAIL, DEFAULT_TENANT_PASSWORD, required=False)
        if not admin:
            admin = self._token_for_user_email(ADMIN_EMAIL)
            if admin:
                print("    (using synthetic JWT — set TEST_TENANT_PASSWORD to test real login)")
        if not admin:
            print("    Hint: set TEST_TENANT_PASSWORD in env if admin password differs")
        else:
            status, _ = self.request("GET", "/workspace", token=admin)
            self.check("admin GET /workspace", status == 200, str(_))

            status, patched = self.request(
                "PATCH",
                "/workspace/profile",
                token=admin,
                body={"headquarters": "Test HQ (API integration)"},
            )
            self.check("admin PATCH /workspace/profile", status == 200, str(patched))
            if status == 200:
                self.check(
                    "profile patch persisted",
                    patched.get("headquarters") == "Test HQ (API integration)",
                )

            status, _ = self.request(
                "PATCH",
                "/workspace/industry",
                token=admin,
                body={"primary_industry": "Technology & Software"},
            )
            self.check("admin PATCH /workspace/industry", status == 200, str(_))

            status, proc = self.request(
                "POST",
                "/workspace/processors",
                token=admin,
                body={
                    "name": "API Test Processor",
                    "purpose": "Integration test",
                    "dpa_status": "none",
                    "risk_level": "Low",
                },
            )
            self.check("admin POST /workspace/processors", status == 201, str(proc))
            proc_id = proc.get("id") if status == 201 else None

            if proc_id:
                status, _ = self.request(
                    "PATCH",
                    f"/workspace/processors/{proc_id}",
                    token=admin,
                    body={"dpa_status": "signed", "risk_level": "Medium"},
                )
                self.check("admin PATCH processor", status == 200, str(_))

                status, _ = self.request("DELETE", f"/workspace/processors/{proc_id}", token=admin)
                self.check("admin DELETE processor", status == 204, str(_))

            status, _ = self.request(
                "PATCH",
                "/workspace/deployment",
                token=admin,
                body={"primary_region": "Mumbai (ap-south-1)"},
            )
            self.check("admin PATCH /workspace/deployment", status == 200, str(_))

            status, ws = self.request(
                "PATCH",
                "/workspace/deployment",
                token=admin,
                body={
                    "data_residency": [
                        {
                            "category": "Integration test category",
                            "region": "Mumbai",
                            "cross_border": False,
                            "legal_basis": "",
                            "details": "",
                        }
                    ]
                },
            )
            self.check("admin PATCH data_residency", status == 200, str(_))
            if status == 200 and isinstance(ws, dict):
                rows = ws.get("data_residency") or []
                self.check(
                    "data_residency persisted",
                    any(r.get("category") == "Integration test category" for r in rows),
                    str(rows),
                )

            status, _ = self.request(
                "PATCH",
                "/workspace/role-mapping",
                token=admin,
                body={"role_assessment": {"source": "integration-test"}},
            )
            self.check("admin PATCH /workspace/role-mapping", status == 200, str(_))

        print("\n4. Org user (read-only)")
        user = self.login(USER_EMAIL, DEFAULT_TENANT_PASSWORD, required=False)
        if not user:
            user = self._token_for_user_email(USER_EMAIL)
            if user:
                print("    (using synthetic JWT — set TEST_TENANT_PASSWORD to test real login)")
        if not user:
            print("    Hint: set TEST_TENANT_PASSWORD in env if user password differs")
        else:
            status, _ = self.request("GET", "/workspace", token=user)
            self.check("user GET /workspace", status == 200, str(_))

            status, _ = self.request("GET", "/workspace/obligations", token=user)
            self.check("user GET /workspace/obligations", status == 200, str(_))

            status, _ = self.request(
                "PATCH",
                "/workspace/profile",
                token=user,
                body={"headquarters": "Should not apply"},
            )
            self.check("user PATCH /workspace/profile -> 403", status == 403, str(_))

        print("\n5. Service layer (DB)")
        try:
            from app.core.database import SessionLocal
            from app.models.dpdp_obligation_definition import DpdpObligationDefinition
            from app.models.organization_settings import OrganizationSettings
            from app.models.user import User
            from app.services.workspace_service import WorkspaceService

            db = SessionLocal()
            admin_user = db.query(User).filter(User.email == ADMIN_EMAIL).first()
            if admin_user:
                ws = WorkspaceService(db).get_workspace(admin_user)
                self.check("WorkspaceService.get_workspace", ws.organization.name != "")
                cnt = db.query(OrganizationSettings).count()
                self.check("organization_settings rows exist", cnt > 0, f"count={cnt}")
                obl = db.query(DpdpObligationDefinition).count()
                self.check("obligation seed count >= 9", obl >= 9, f"count={obl}")
                obs = WorkspaceService(db).list_obligations()
                self.check(
                    "list_obligations mandatory-high-risk enum",
                    any(
                        (getattr(o.sdf, "value", o.sdf) == "mandatory-high-risk")
                        for o in obs
                    ),
                )
            db.close()
        except Exception as exc:
            self.fail("service layer", str(exc))

        print("\n=== Summary ===")
        if self.failures:
            print(f"FAILED ({len(self.failures)}): " + ", ".join(self.failures))
            return 1
        print("All tests passed.")
        return 0


def main() -> None:
    sys.exit(TestRunner().run())


if __name__ == "__main__":
    main()
