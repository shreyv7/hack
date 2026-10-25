"""
Fetch recent log events from a connected log source so the PII Scanner can scan
them for leaked personal data (free-text detection).

`fetch_logs(source)` returns a list of (label, text) chunks — one per log group /
workspace / source. Bounded by MAX_EVENTS and MAX_TEXT_CHARS so a noisy log can't
blow up a scan.
"""

from __future__ import annotations

import json
import logging

from app.core.crypto import decrypt_secret
from app.models.data_source import DataSource
from app.services import file_scanner

logger = logging.getLogger(__name__)

MAX_EVENTS = 2000          # events pulled per group/source
MAX_GROUPS = 5             # log groups scanned when none is specified
MAX_TEXT_CHARS = file_scanner.MAX_TEXT_CHARS
HTTP_TIMEOUT = 20.0


def _cfg(source: DataSource) -> dict:
    return source.extra_config or {}


def _secret(source: DataSource) -> str:
    return decrypt_secret(source.password) if source.password else ""


def _clip(text: str) -> str:
    return text[:MAX_TEXT_CHARS]


def fetch_logs(source: DataSource) -> list[tuple[str, str]]:
    st = source.source_type
    if st == "cloudwatch":
        return _cloudwatch(source)
    if st == "azure_monitor":
        return _azure_monitor(source)
    if st == "gcp_logging":
        return _gcp_logging(source)
    if st == "splunk":
        return _splunk(source)
    raise ValueError(f"Log scanning is not supported for '{st}' sources.")


# --------------------------------------------------------------------------- #
# AWS CloudWatch
# --------------------------------------------------------------------------- #

def _cloudwatch(source: DataSource) -> list[tuple[str, str]]:
    import boto3
    from botocore.config import Config

    cfg = _cfg(source)
    client = boto3.client(
        "logs",
        aws_access_key_id=source.username or None,
        aws_secret_access_key=_secret(source) or None,
        aws_session_token=cfg.get("session_token") or None,
        region_name=source.region or None,
        config=Config(connect_timeout=HTTP_TIMEOUT, read_timeout=HTTP_TIMEOUT, retries={"max_attempts": 2}),
    )
    if source.host:
        groups = [source.host]
    else:
        groups = [
            g["logGroupName"]
            for g in client.describe_log_groups(limit=MAX_GROUPS).get("logGroups", [])
        ]
    out: list[tuple[str, str]] = []
    for group in groups:
        try:
            resp = client.filter_log_events(logGroupName=group, limit=MAX_EVENTS)
        except Exception:  # noqa: BLE001 — one bad group shouldn't abort the rest
            continue
        text = "\n".join(e.get("message", "") for e in resp.get("events", []))
        if text.strip():
            out.append((f"cloudwatch:{group}", _clip(text)))
    return out


# --------------------------------------------------------------------------- #
# Azure Monitor (Log Analytics)
# --------------------------------------------------------------------------- #

def _azure_monitor(source: DataSource) -> list[tuple[str, str]]:
    from datetime import timedelta

    from azure.identity import ClientSecretCredential
    from azure.monitor.query import LogsQueryClient

    cfg = _cfg(source)
    tenant = cfg.get("tenant_id")
    client_id = cfg.get("client_id")
    workspace = cfg.get("workspace_id")
    secret = _secret(source)
    if not (tenant and client_id and secret and workspace):
        raise ValueError("Azure Monitor needs tenant_id, client_id, workspace_id and the client secret.")
    cred = ClientSecretCredential(tenant_id=tenant, client_id=client_id, client_secret=secret)
    client = LogsQueryClient(cred)
    kql = cfg.get("kql") or f"search * | take {MAX_EVENTS}"
    days = int(cfg.get("days", 1))
    resp = client.query_workspace(workspace, kql, timespan=timedelta(days=days))

    lines: list[str] = []
    for table in getattr(resp, "tables", []) or []:
        for row in table.rows:
            lines.append(" ".join(str(v) for v in row if v is not None))
            if len(lines) >= MAX_EVENTS:
                break
    text = "\n".join(lines)
    return [("azure-monitor", _clip(text))] if text.strip() else []


# --------------------------------------------------------------------------- #
# Google Cloud Logging
# --------------------------------------------------------------------------- #

def _gcp_logging(source: DataSource) -> list[tuple[str, str]]:
    from google.cloud import logging as gcloud_logging
    from google.oauth2 import service_account

    cfg = _cfg(source)
    raw = cfg.get("service_account_json")
    if not raw:
        raise ValueError("Provide the service-account JSON in Advanced configuration.")
    info = raw if isinstance(raw, dict) else json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info)
    project = cfg.get("project") or info.get("project_id")
    client = gcloud_logging.Client(project=project, credentials=creds)

    lines: list[str] = []
    for entry in client.list_entries(max_results=MAX_EVENTS, page_size=200):
        payload = entry.payload
        lines.append(payload if isinstance(payload, str) else json.dumps(payload, default=str))
        if len(lines) >= MAX_EVENTS:
            break
    text = "\n".join(lines)
    return [(f"gcp-logging:{project}", _clip(text))] if text.strip() else []


# --------------------------------------------------------------------------- #
# Splunk
# --------------------------------------------------------------------------- #

def _splunk(source: DataSource) -> list[tuple[str, str]]:
    import httpx

    base = source.host
    if not base:
        raise ValueError("Splunk base URL is required (e.g. https://host:8089).")
    if not base.startswith(("http://", "https://")):
        base = "https://" + base
    cfg = _cfg(source)
    verify = cfg.get("verify_ssl", False)
    secret = _secret(source)
    headers, auth = {}, None
    if source.username:
        auth = (source.username, secret)
    elif secret:
        headers["Authorization"] = f"Bearer {secret}"

    search = cfg.get("search") or f"search index=* | head {MAX_EVENTS}"
    r = httpx.post(
        f"{base.rstrip('/')}/services/search/jobs/export",
        data={"search": search, "output_mode": "json", "count": MAX_EVENTS},
        headers=headers,
        auth=auth,
        timeout=HTTP_TIMEOUT,
        verify=verify,
    )
    if r.status_code >= 400:
        raise ValueError(f"Splunk search failed (HTTP {r.status_code}).")

    lines: list[str] = []
    for line in r.text.splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        result = obj.get("result")
        if not result:
            continue
        lines.append(result.get("_raw") or " ".join(str(v) for v in result.values()))
    text = "\n".join(lines)
    return [("splunk", _clip(text))] if text.strip() else []
