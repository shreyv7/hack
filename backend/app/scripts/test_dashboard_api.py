"""
Overview / Dashboard API integration test.

Run from backend/:
  python -m app.scripts.test_dashboard_api
"""

from __future__ import annotations

import json
import os
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

    def assert_ok(self, name: str, status: int, payload) -> bool:
        if status != 200:
            self.failures.append(f"{name}: HTTP {status} — {payload}")
            return False
        return True

    def login(self) -> str | None:
        status, payload = self.request(
            "POST",
            "/auth/login",
            body={"email": ADMIN_EMAIL, "password": SA_PASSWORD},
        )
        if status != 200:
            self.failures.append(f"login failed: {status} {payload}")
            return None
        return payload.get("access_token")

    def run(self) -> int:
        print("Dashboard API smoke test")
        print(f"Base URL: {BASE}")
        token = self.login()
        if not token:
            return 1

        endpoints = [
            ("GET /dashboard/summary", "/dashboard/summary"),
            ("GET /dashboard/module-health", "/dashboard/module-health"),
            ("GET /dashboard/activity-feed", "/dashboard/activity-feed", {"limit": 5}),
            ("GET /dashboard/deadlines", "/dashboard/deadlines", {"limit": 5}),
            ("GET /dashboard/processing-trend", "/dashboard/processing-trend", {"months": 3}),
            ("GET /dashboard/risk-heatmap", "/dashboard/risk-heatmap"),
            ("GET /dashboard/onboarding-status", "/dashboard/onboarding-status"),
            ("GET /compliance/score", "/compliance/score"),
            ("GET /compliance/score/breakdown", "/compliance/score/breakdown"),
            ("GET /compliance/score/trend", "/compliance/score/trend", {"days": 30}),
            ("GET /overview/automation-coverage", "/overview/automation-coverage"),
        ]

        for item in endpoints:
            name = item[0]
            path = item[1]
            params = item[2] if len(item) > 2 else None
            status, payload = self.request("GET", path, token=token, params=params)
            ok = self.assert_ok(name, status, payload)
            print(f"{'PASS' if ok else 'FAIL'} {name}")
            if ok and isinstance(payload, dict):
                if "compliance_score" in payload:
                    print(f"  compliance_score={payload['compliance_score']}")
                if "overall_score" in payload:
                    print(f"  overall_score={payload['overall_score']}")
                if "coverage_percent" in payload:
                    print(f"  coverage_percent={payload['coverage_percent']}%")

        if self.failures:
            print("\nFailures:")
            for f in self.failures:
                print(f"  - {f}")
            return 1
        print("\nAll dashboard endpoints OK")
        return 0


if __name__ == "__main__":
    raise SystemExit(TestRunner().run())
