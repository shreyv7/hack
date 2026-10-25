"""
Full DSAR / Rights Portal + DPDPA alignment test suite.

Run from backend/:
  python -m app.scripts.test_dsar_full
"""

from __future__ import annotations

import json
import os
import uuid
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
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


class Runner:
    def __init__(self) -> None:
        self.failures: list[str] = []

    def request(self, method, path, *, token=None, body=None):
        url = f"{BASE}{path}"
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

    def ok(self, name: str, cond: bool, detail: str = "") -> None:
        if cond:
            print(f"  OK   {name}")
        else:
            print(f"  FAIL {name}: {detail[:500]}")
            self.failures.append(name)

    def run(self) -> None:
        print("=== DSAR Full Feature Test Suite ===\n")

        from app.core.database import SessionLocal
        from app.core.security import create_access_token
        from app.models.dsar import DataRightType, DataRightsRequestStatus
        from app.models.organization import Organization
        from app.models.user import User, UserRole
        from app.schemas.dsar import PortalRequestCreate
        from app.services.dsar_service import DsarService, OTP_EXPIRY_MINUTES

        suffix = uuid.uuid4().hex[:8]
        db = SessionLocal()

        admin = db.query(User).filter(User.role == UserRole.admin).first()
        if admin is None:
            admin = db.query(User).filter(User.role == UserRole.superadmin).first()
        if admin is None:
            print("FATAL: no admin/superadmin user")
            raise SystemExit(1)

        org = db.get(Organization, admin.organization_id) if admin.organization_id else None
        if org is None:
            org = db.query(Organization).first()
        assert org is not None
        org_slug = org.slug
        admin_token = create_access_token(str(admin.id), role=admin.role.value, org_id=admin.organization_id)
        svc = DsarService(db)

        # --- HTTP: health + branding ---
        print("1. Public portal HTTP")
        st, _ = self.request("GET", "/health")
        self.ok("GET /health", st == 200)

        st, branding = self.request("GET", f"/dsar/portal/{org_slug}/branding")
        self.ok("GET portal branding", st == 200 and isinstance(branding, dict), str(branding))
        self.ok(
            "branding has org name",
            isinstance(branding, dict) and bool(branding.get("organization_name")),
            "",
        )

        # --- All right types: create + no SLA until verify ---
        print("\n2. All right types + SLA clock at verify")
        right_types = [
            "access",
            "correction",
            "erasure",
            "nomination",
            "grievance",
            "withdraw_consent",
        ]
        grievance_tid = None
        for rt in right_types:
            body = PortalRequestCreate(
                right_type=DataRightType(rt),
                requester_name=f"Test {rt} {suffix}",
                requester_email=f"dsar-{rt}-{suffix}@example.com",
                request_details=f"Test request for {rt}",
            )
            created = svc.create_portal_request(org_slug, body)
            req = svc._get_request_by_tracking(org.id, created.tracking_id)
            self.ok(f"create {rt}", bool(created.tracking_id), "")
            self.ok(f"{rt} no due_at before verify", req.due_at is None, str(req.due_at))
            self.ok(
                f"{rt} pending_verification",
                req.status == DataRightsRequestStatus.pending_verification,
                req.status.value,
            )
            otp = "111111"
            req.otp_code_hash = svc._hash_otp(otp, created.tracking_id)
            req.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
            db.commit()
            svc.verify_otp(
                org_slug, created.tracking_id, otp, email=str(body.requester_email)
            )
            db.refresh(req)
            self.ok(f"{rt} received_at set", req.received_at is not None, "")
            self.ok(f"{rt} due_at after verify", req.due_at is not None, "")
            if rt == "grievance":
                grievance_tid = created.tracking_id
                self.ok("grievance ack_due_at set", req.ack_due_at is not None, "")
                self.ok(
                    "grievance ack within 24h",
                    req.ack_due_at is not None
                    and req.received_at is not None
                    and (req.ack_due_at - req.received_at).total_seconds() <= 86400 + 60,
                    "",
                )

        # --- Grievance acknowledgement ---
        print("\n3. Grievance S.13 acknowledgement")
        from app.models.dsar import DataRightsRequest
        from app.schemas.dsar import DataRightsRequestUpdate

        grievance_req = svc._get_request_by_tracking(org.id, grievance_tid)
        self.ok("grievance unacked initially", grievance_req.acknowledged_at is None, "")
        updated = svc.update_request(
            admin,
            grievance_req.id,
            DataRightsRequestUpdate(acknowledge_grievance=True),
        )
        self.ok("acknowledge grievance", updated.acknowledged_at is not None, "")

        # --- Assign handler ---
        print("\n4. Handler assignment")
        any_req = (
            db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == org.id,
                DataRightsRequest.status == DataRightsRequestStatus.received,
            )
            .first()
        )
        self.ok("has request for assign", any_req is not None, "")
        if any_req:
            assigned = svc.update_request(
                admin,
                any_req.id,
                DataRightsRequestUpdate(assigned_to_user_id=admin.id),
            )
            self.ok("assign handler", str(assigned.assigned_to_user_id) == str(admin.id), "")

        # --- Dashboard metrics ---
        print("\n5. Admin dashboard + DPDPA metrics")
        dash = svc.get_dashboard(admin)
        self.ok("dashboard requests", isinstance(dash.requests, list), "")
        self.ok(
            "metrics pending_verification",
            hasattr(dash.metrics, "pending_verification"),
            str(dash.metrics),
        )
        self.ok("metrics ack_overdue field", hasattr(dash.metrics, "ack_overdue"), "")
        self.ok("sla matrix rows", len(dash.matrix) == len(DataRightType), str(len(dash.matrix)))
        grievance_row = next((r for r in dash.matrix if r.right_type == DataRightType.grievance), None)
        self.ok(
            "grievance matrix sla_label",
            grievance_row is not None and grievance_row.sla_label is not None and "ack" in grievance_row.sla_label,
            str(grievance_row),
        )

        # --- Resolve + closure ---
        print("\n6. Resolve + closure letter")
        to_resolve = (
            db.query(DataRightsRequest)
            .filter(
                DataRightsRequest.organization_id == org.id,
                DataRightsRequest.status != DataRightsRequestStatus.completed,
            )
            .first()
        )
        if to_resolve:
            resolved = svc.resolve_request(admin, to_resolve.id, "Automated test closure")
            self.ok("resolve request", resolved.status == DataRightsRequestStatus.completed, "")
            self.ok("closure text generated", bool(resolved.closure_text), "")
            self.ok("closure cites DPDPA", "DPDPA" in (resolved.closure_text or ""), "")

        # --- SLA engine ---
        print("\n7. SLA engine")
        sla = svc.run_sla_engine_once()
        self.ok("sla engine runs", sla.processed >= 0, str(sla))

        # --- HTTP admin + public flow ---
        print("\n8. HTTP API end-to-end")
        email = f"e2e-{suffix}@example.com"
        st, created = self.request(
            "POST",
            f"/dsar/portal/{org_slug}/requests",
            body={
                "right_type": "grievance",
                "requester_name": "E2E Test",
                "requester_email": email,
                "request_details": "E2E grievance test",
            },
        )
        self.ok("HTTP POST grievance", st == 201, str(created))
        tid = created.get("tracking_id") if isinstance(created, dict) else None

        if tid:
            st, sc = self.request(
                "POST",
                f"/dsar/portal/{org_slug}/requests/{tid}/status-check",
                body={"email": email},
            )
            self.ok("HTTP status-check unverified", st == 200 and sc.get("verification_required"), str(sc)[:80])

            req_http = svc._get_request_by_tracking(org.id, tid)
            otp = "999999"
            req_http.otp_code_hash = svc._hash_otp(otp, tid)
            req_http.otp_expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES)
            db.commit()

            st, vr = self.request(
                "POST",
                f"/dsar/portal/{org_slug}/requests/{tid}/verify-otp",
                body={"email": email, "otp_code": otp},
            )
            self.ok("HTTP verify-otp", st == 200 and vr.get("verified"), str(vr)[:80])

        st, dash_http = self.request("GET", "/dsar/dashboard", token=admin_token)
        self.ok("HTTP GET dashboard", st == 200, str(dash_http)[:80] if dash_http else "")
        if isinstance(dash_http, dict):
            m = dash_http.get("metrics", {})
            self.ok("HTTP metrics shape", "pending_verification" in m and "ack_overdue" in m, str(m))

        st, sla_http = self.request("POST", "/dsar/admin/sla/run-once", token=admin_token)
        self.ok("HTTP sla run-once", st == 200, str(sla_http))

        db.close()

        print("\n=== Summary ===")
        if self.failures:
            print(f"Failed: {len(self.failures)}")
            for f in self.failures:
                print(f"  - {f}")
            raise SystemExit(1)
        print(f"All {8} sections passed.")


if __name__ == "__main__":
    Runner().run()
