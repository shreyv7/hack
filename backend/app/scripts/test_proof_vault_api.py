import urllib.request
import urllib.error
import json
import os
import sys
from pathlib import Path

# Load env
_env_path = Path(__file__).resolve().parents[2] / ".env"
if _env_path.exists():
    for raw in _env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

from app.core.database import SessionLocal
from app.core.security import create_access_token
from app.models.user import User, UserRole

db = SessionLocal()
admin = db.query(User).filter(User.role == UserRole.admin).first()
db.close()

if not admin:
    print("FAIL: No admin user in database.")
    sys.exit(1)

token = create_access_token(
    str(admin.id),
    role=admin.role.value,
    org_id=admin.organization_id,
)

BASE = "http://127.0.0.1:8000/api"

def make_request(method: str, path: str, body: dict = None) -> tuple[int, dict]:
    url = f"{BASE}{path}"
    data = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}"
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = resp.read()
            # If zip file (export endpoint)
            if "application/zip" in resp.headers.get("Content-Type", ""):
                return resp.status, {"zip_size": len(raw)}
            return resp.status, json.loads(raw.decode("utf-8")) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, {"error": raw}

# Tests
print("Testing Proof Vault Backend Endpoints...")

# 1. Summary
status, summary = make_request("GET", "/proof-vault/summary")
assert status == 200, f"Summary failed: {summary}"
print(f"Summary OK: {summary}")

# 2. Records
status, records = make_request("GET", "/proof-vault/records")
assert status == 200, f"Records failed: {records}"
print(f"Records OK, found {len(records)} records.")

# 3. Verifications
status, verifications = make_request("GET", "/proof-vault/verifications")
assert status == 200, f"Verifications failed: {verifications}"
print(f"Verifications OK, found {len(verifications)} history items.")

# 4. Verify Integrity
status, verify_result = make_request("POST", "/proof-vault/verify")
assert status == 200, f"Verify integrity failed: {verify_result}"
print(f"Verify Integrity OK: {verify_result}")

# 5. Verify Chain
status, chain_result = make_request("POST", "/proof-vault/verify-chain")
assert status == 200, f"Verify chain failed: {chain_result}"
print(f"Verify Chain OK: {chain_result}")

# 6. Export Proof Pack
status, export_result = make_request("POST", "/proof-vault/export")
assert status == 200, f"Export failed: {export_result}"
print(f"Export OK: {export_result}")

print("All Proof Vault backend routes verified successfully!")
