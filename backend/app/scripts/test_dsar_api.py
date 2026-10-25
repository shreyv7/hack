"""
DSAR / Rights Portal API integration test.

Run from backend/:
  python -m app.scripts.test_dsar_api
"""

from __future__ import annotations

import json
import os
import uuid
import urllib.error
import urllib.request
from pathlib import Path

_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    for raw in _env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

BASE = os.environ.get("TEST_API_BASE", "http://127.0.0.1:8000/api")
ADMIN_EMAIL = os.environ.get("TEST_ADMIN_EMAIL", "pvashisth0711@gmail.com")
SA_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "")


class TestRunner:
    def __init__(self) -> None:
        self.failures: list[str] = []
        self._last_otp: str | None = None

    def request(self, method, path, *, token=None, body=None, params=None):
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

    def login(self, email: str, password: str) -> str | None:
        status, payload = self.request("POST", "/auth/login", body={"email": email, "password": password})
        if status == 200 and isinstance(payload, dict):
            return payload.get("access_token")
        return None

    def run(self) -> None:
        print("=== DSAR / Rights Portal Test Suite ===")
        status, health = self.request("GET", "/health")
        self.check("GET /health", status == 200, str(health))

        suffix = uuid.uuid4().hex[:8]
        org_slug = None
        admin_token = None

        try:
            from app.core.database import SessionLocal
            from app.core.security import create_access_token
            from app.models.organization import Organization
            from app.models.user import User, UserRole
            from app.schemas.dsar import PortalRequestCreate
            from app.services.dsar_service import DsarService, OTP_EXPIRY_MINUTES
            from datetime import datetime, timedelta, timezone
            from app.models.dsar import DataRightType

            db = SessionLocal()
            admin = db.query(User).filter(User.role == UserRole.admin).first()
            if admin is None:
                admin = db.query(User).filter(User.role == UserRole.superadmin).first()
            if admin is None:
                print("  SKIP service tests — no admin user")
                db.close()
            else:
                org = db.get(Organization, admin.organization_id) if admin.organization_id else None
                if org is None:
                    org = db.query(Organization).first()
                org_slug = org.slug if org else None
                admin_token = create_access_token(str(admin.id), role=admin.role.value, org_id=admin.organization_id)

                svc = DsarService(db)
                body = PortalRequestCreate(
                    right_type=DataRightType.access,
                    requester_name=f"Test User {suffix}",
                    requester_email=f"dsar-test-{suffix}@example.com",
                    requester_phone="+910000000000",
                    request_details="Please provide a copy of my personal data.",
                    verification_method="email",
                )
                created = svc.create_portal_request(org.slug, body)
                self.check("create portal request", bool(created.tracking_id), str(created))

                req = svc._get_request_by_tracking(org.id, created.tracking_id)
                otp = "123456"
                req.otp_code_hash = svc._hash_otp(otp, created.tracking_id)
                req.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
                db.commit()

                verified, _ = svc.verify_otp(
                    org.slug, created.tracking_id, otp, email=str(body.requester_email)
                )
                self.check("verify otp", verified, "")
                db.refresh(req)
                self.check("sla clock starts at verify", req.received_at is not None, "")
                self.check("due_at set after verify", req.due_at is not None, "")

                status_resp = svc.status_check(
                    org.slug, created.tracking_id, email=str(body.requester_email)
                )
                self.check("status check verified", not status_resp.verification_required, "")

                dash = svc.get_dashboard(admin)
                self.check("admin dashboard", isinstance(dash.requests, list), "")

                if dash.requests:
                    rid = dash.requests[0].id
                    resolved = svc.resolve_request(admin, rid, "Test closure")
                    self.check("resolve request", resolved.status.value == "completed", "")
                    self.check("closure text", bool(resolved.closure_text), "")

                sla = svc.run_sla_engine_once()
                self.check("sla engine run", sla.processed >= 0, str(sla))

                db.close()
        except Exception as exc:
            self.check("service layer", False, str(exc))

        if admin_token and org_slug:
            print("\n2. HTTP API (public portal + admin)")
            email = f"http-dsar-{suffix}@example.com"
            status, created = self.request(
                "POST",
                f"/dsar/portal/{org_slug}/requests",
                body={
                    "right_type": "access",
                    "requester_name": "HTTP Test",
                    "requester_email": email,
                    "request_details": "HTTP integration test request",
                    "verification_method": "email",
                },
            )
            self.check("POST portal request", status == 201, str(created))
            tracking_id = created.get("tracking_id") if isinstance(created, dict) else None
            self.check(
                "portal verification_required",
                isinstance(created, dict) and created.get("verification_required") is True,
                str(created)[:120],
            )

            if tracking_id:
                status, status_resp = self.request(
                    "POST",
                    f"/dsar/portal/{org_slug}/requests/{tracking_id}/status-check",
                    body={"email": email},
                )
                self.check(
                    "status check requires verify",
                    status == 200
                    and isinstance(status_resp, dict)
                    and status_resp.get("verification_required") is True,
                    str(status_resp)[:120],
                )

                # Set known OTP and exercise verify-otp HTTP endpoint
                from app.core.database import SessionLocal
                from app.services.dsar_service import DsarService, OTP_EXPIRY_MINUTES
                from datetime import datetime, timedelta, timezone

                db2 = SessionLocal()
                svc2 = DsarService(db2)
                org2 = svc2._get_org_by_slug(org_slug)
                req2 = svc2._get_request_by_tracking(org2.id, tracking_id)
                otp_http = "654321"
                req2.otp_code_hash = svc2._hash_otp(otp_http, tracking_id)
                req2.otp_expires_at = datetime.now(timezone.utc) + timedelta(
                    minutes=OTP_EXPIRY_MINUTES
                )
                db2.commit()
                db2.close()

                status, verify_resp = self.request(
                    "POST",
                    f"/dsar/portal/{org_slug}/requests/{tracking_id}/verify-otp",
                    body={"email": email, "otp_code": otp_http},
                )
                self.check(
                    "POST verify-otp",
                    status == 200
                    and isinstance(verify_resp, dict)
                    and verify_resp.get("verified") is True,
                    str(verify_resp)[:120],
                )

            status, dash = self.request("GET", "/dsar/dashboard", token=admin_token)
            self.check("GET dashboard", status == 200, str(dash)[:120])

            status, sla = self.request("POST", "/dsar/admin/sla/run-once", token=admin_token)
            self.check("POST sla run-once", status == 200, str(sla))

            status, invalid_phone = self.request(
                "POST",
                f"/dsar/portal/{org_slug}/requests",
                body={
                    "right_type": "access",
                    "requester_name": "Bad Phone",
                    "requester_phone": "44444444444444444444444444444444444444448",
                    "request_details": "Should be rejected",
                    "verification_method": "sms",
                },
            )
            self.check(
                "reject invalid phone length",
                status == 422,
                str(invalid_phone)[:160],
            )

            status, valid_phone = self.request(
                "POST",
                f"/dsar/portal/{org_slug}/requests",
                body={
                    "right_type": "access",
                    "requester_name": "Good Phone",
                    "requester_phone": "9876543210",
                    "request_details": "SMS-only valid phone",
                    "verification_method": "sms",
                },
            )
            self.check(
                "accept 10-digit phone normalized",
                status == 201 and isinstance(valid_phone, dict),
                str(valid_phone)[:160],
            )

        print("\n=== Summary ===")
        if self.failures:
            print(f"Failed: {len(self.failures)} — {', '.join(self.failures)}")
            raise SystemExit(1)
        print("All tests passed.")


if __name__ == "__main__":
    TestRunner().run()
