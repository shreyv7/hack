"""
Compliance module API integration test.

Run from backend/:
  python -m app.scripts.test_compliance_api
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
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
SA_EMAIL = os.environ.get("SUPERADMIN_EMAIL", "superadmin@zeroshield.in")
SA_PASSWORD = os.environ.get("SUPERADMIN_PASSWORD", "")


class Runner:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0

    def ok(self, label: str, cond: bool, detail: str = "") -> None:
        if cond:
            self.passed += 1
            print(f"  OK  {label}" + (f" — {detail}" if detail else ""))
        else:
            self.failed += 1
            print(f" FAIL {label}" + (f" — {detail}" if detail else ""))

    def request(self, method: str, path: str, *, token: str | None = None, body: dict | None = None):
        url = f"{BASE}{path}"
        data = json.dumps(body).encode() if body is not None else None
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.status, json.loads(resp.read().decode())
        except urllib.error.HTTPError as e:
            try:
                payload = json.loads(e.read().decode())
            except Exception:
                payload = {"detail": e.reason}
            return e.code, payload

    def login(self, email: str, password: str) -> str | None:
        st, data = self.request("POST", "/auth/login", body={"email": email, "password": password})
        if st == 200:
            return data.get("access_token")
        return None

    def run(self) -> int:
        print("=== Compliance API tests ===\n")
        token = self.login(SA_EMAIL, SA_PASSWORD)
        self.ok("superadmin login", token is not None)
        if not token:
            print("\nCannot continue without auth token")
            return 1

        st, orgs = self.request("GET", "/admin/organizations", token=token)
        org_id = orgs[0]["id"] if st == 200 and isinstance(orgs, list) and orgs else None
        self.ok("list organizations", org_id is not None)
        if not org_id:
            print("\nCannot continue without organization context")
            return 1
        org_q = f"?org_id={org_id}"

        # Superadmin must pass org_id
        st, _ = self.request("GET", "/compliance/map/summary", token=token)
        self.ok("superadmin without org_id returns 403", st == 403)

        # --- DPDPA Map ---
        st, summary = self.request("GET", f"/compliance/map/summary{org_q}", token=token)
        self.ok(
            "map summary",
            st == 200 and summary.get("sections_total", 0) >= 21,
            str(summary.get("sections_total")),
        )

        st, chapters = self.request("GET", f"/compliance/map/chapters{org_q}", token=token)
        section_count = sum(len(c.get("sections", [])) for c in chapters) if st == 200 else 0
        self.ok("map chapters", st == 200 and section_count >= 21, str(section_count))

        st, section = self.request("GET", f"/compliance/map/sections/2-6{org_q}", token=token)
        features = section.get("features", []) if st == 200 else []
        self.ok("map section 2-6 detail", st == 200 and len(features) >= 18, str(len(features)))

        st, reviewed = self.request(
            "PATCH",
            f"/compliance/map/review{org_q}",
            token=token,
            body={"reviewed_by": "Compliance API test"},
        )
        self.ok(
            "map review stamp",
            st == 200 and reviewed.get("last_reviewed_by") == "Compliance API test",
            reviewed.get("last_reviewed_by", ""),
        )

        # --- Security Safeguards ---
        st, safeguards = self.request("GET", f"/compliance/safeguards{org_q}", token=token)
        controls = safeguards.get("controls", []) if st == 200 else []
        self.ok("safeguards hub", st == 200 and len(controls) == 7, str(len(controls)))

        st, sg_summary = self.request("GET", f"/compliance/safeguards/summary{org_q}", token=token)
        self.ok(
            "safeguards summary",
            st == 200 and sg_summary.get("total_controls") == 7,
            f"score={sg_summary.get('score')}",
        )

        if controls:
            cid = controls[0]["id"]
            st, patched = self.request(
                "PATCH",
                f"/compliance/safeguards/controls/{cid}{org_q}",
                token=token,
                body={"status": "documented", "evidence_label": "API test evidence"},
            )
            self.ok("patch security control", st == 200, patched.get("status", ""))

        # --- Breach Disclosure Wizard ---
        st, draft = self.request("GET", f"/compliance/breaches/active-draft{org_q}", token=token)
        self.ok("breach active-draft", st == 200)

        st, breach = self.request(
            "POST",
            f"/compliance/breaches{org_q}",
            token=token,
            body={"severity": "high", "wizard_data": {"incident_summary": "API test breach"}},
        )
        self.ok("create breach incident", st == 201, breach.get("incident_ref", ""))
        bid = breach.get("id") if st == 201 else None

        if bid:
            st, got = self.request("GET", f"/compliance/breaches/{bid}{org_q}", token=token)
            self.ok("get breach by id", st == 200, got.get("incident_ref", ""))

            st, updated = self.request(
                "PATCH",
                f"/compliance/breaches/{bid}{org_q}",
                token=token,
                body={
                    "current_step": 3,
                    "wizard_data": {
                        "incident_summary": "Test breach",
                        "dp_email_subject": "Breach notice",
                        "dp_message_body": "Your data may have been affected.",
                    },
                },
            )
            self.ok("patch breach wizard", st == 200, f"step={updated.get('current_step')}")

            remaining = breach.get("deadline_remaining_seconds", 0)
            self.ok("72h SLA deadline", remaining > 0, f"{remaining}s")

            st, dpb = self.request(
                "POST", f"/compliance/breaches/{bid}/notify-dpb{org_q}", token=token
            )
            self.ok("notify DPB", st == 200 and "message" in dpb, dpb.get("message", ""))

            st, dp = self.request(
                "POST", f"/compliance/breaches/{bid}/notify-principals{org_q}", token=token
            )
            self.ok("notify principals", st == 200 and "message" in dp, dp.get("message", ""))

            st, submitted = self.request(
                "POST", f"/compliance/breaches/{bid}/submit{org_q}", token=token
            )
            self.ok("submit breach", st == 200, submitted.get("status", ""))

        st, breach_list = self.request("GET", f"/compliance/breaches{org_q}", token=token)
        self.ok(
            "list breach incidents",
            st == 200 and isinstance(breach_list, list) and len(breach_list) >= 1,
            str(len(breach_list) if isinstance(breach_list, list) else 0),
        )

        # --- Audit Log ---
        st, audit_summary = self.request("GET", f"/compliance/audit/summary{org_q}", token=token)
        self.ok(
            "audit summary",
            st == 200 and audit_summary.get("entry_count", 0) >= 1,
            str(audit_summary.get("entry_count")),
        )

        st, events = self.request("GET", f"/compliance/audit/events{org_q}", token=token)
        total = events.get("total", 0) if st == 200 else 0
        self.ok("audit events list", st == 200 and total >= 1, str(total))

        if st == 200 and events.get("items"):
            eid = events["items"][0]["id"]
            st, one = self.request("GET", f"/compliance/audit/events/{eid}{org_q}", token=token)
            self.ok("audit event detail", st == 200, one.get("action", ""))

            q = urllib.parse.quote(one.get("action", "Audit")[:20])
            st, filtered = self.request(
                "GET",
                f"/compliance/audit/events{org_q}&q={q}",
                token=token,
            )
            self.ok("audit events search", st == 200, str(filtered.get("total")))

        st, verify = self.request("POST", f"/compliance/audit/verify{org_q}", token=token)
        self.ok(
            "audit hash-chain verify",
            st == 200 and verify.get("integrity_ok") is True,
            verify.get("merkle_root", "")[:16] + "…",
        )

        print(f"\n=== {self.passed} passed, {self.failed} failed ===")
        return 0 if self.failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(Runner().run())
