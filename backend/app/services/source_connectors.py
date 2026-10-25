"""
Unified connection tester for every data-source category.

`test_source(source)` dispatches to the right backend and performs a REAL
reachability/auth check (no metadata-only fallback):

  * database / cloud   → db_connector (SQL engines + MongoDB/Atlas)
  * files              → S3, Azure Blob, GCS, Google Drive, SFTP
  * api                → REST, GraphQL, SOAP (HTTP probe)
  * logs               → CloudWatch, Azure Monitor, GCP Logging, Splunk
  * upload             → verify the stored file exists

Credentials are supplied per-source. The primary fields carry the common case
(see frontend labels):
  host      → bucket / container / base-url / log-group / sftp host
  username  → access-key / account-name / header-name / sftp user
  password  → secret-key / account-key / token / sftp password
  region    → cloud region
Connector-specific extras live in `extra_config` (merged from the UI's
"Advanced configuration (JSON)" box), e.g.:
  engine, endpoint_url, session_token, connection_string,
  service_account_json, project, tenant_id, client_id, workspace_id,
  private_key, path, verify_ssl, srv
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from app.core.crypto import decrypt_secret
from app.models.data_source import DataSource, category_for
from app.services import db_connector

logger = logging.getLogger(__name__)

HTTP_TIMEOUT = 8.0


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #

def _cfg(source: DataSource) -> dict[str, Any]:
    return source.extra_config or {}


def _secret(source: DataSource) -> str:
    return decrypt_secret(source.password) if source.password else ""


def _bucket_and_prefix(host: str | None) -> tuple[str, str]:
    """A files host may be 'bucket' or 'bucket/prefix/path'."""
    if not host:
        return "", ""
    parts = host.strip("/").split("/", 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def _service_account_info(source: DataSource) -> dict:
    raw = _cfg(source).get("service_account_json")
    if not raw:
        raise ValueError("Provide the service-account JSON in Advanced configuration.")
    if isinstance(raw, dict):
        return raw
    return json.loads(raw)


# --------------------------------------------------------------------------- #
# public dispatcher
# --------------------------------------------------------------------------- #

def test_source(source: DataSource) -> tuple[bool, str]:
    cat = source.category or category_for(source.source_type)
    try:
        if cat in ("database", "cloud"):
            return db_connector.test_connection(source)
        if cat == "files":
            return _test_files(source)
        if cat == "api":
            return _test_api(source)
        if cat == "logs":
            return _test_logs(source)
        if cat == "upload":
            return _test_upload(source)
    except ValueError as exc:  # our own "missing field" messages
        return False, str(exc)
    except Exception as exc:  # noqa: BLE001 — surface the driver's message
        logger.info("test_source failed for %s (%s): %s", source.id, source.source_type, exc)
        return False, f"Connection failed: {exc}"
    return False, f"Unknown source category '{cat}'."


# --------------------------------------------------------------------------- #
# files
# --------------------------------------------------------------------------- #

def _test_files(source: DataSource) -> tuple[bool, str]:
    st = source.source_type
    if st == "s3":
        return _test_s3(source)
    if st == "azure_blob":
        return _test_azure_blob(source)
    if st == "gcs":
        return _test_gcs(source)
    if st == "gdrive":
        return _test_gdrive(source)
    if st == "sftp":
        return _test_sftp(source)
    raise ValueError(f"Unsupported file connector '{st}'.")


def _test_s3(source: DataSource) -> tuple[bool, str]:
    import boto3
    from botocore.config import Config

    cfg = _cfg(source)
    bucket, _ = _bucket_and_prefix(source.host)
    client = boto3.client(
        "s3",
        aws_access_key_id=source.username or None,
        aws_secret_access_key=_secret(source) or None,
        aws_session_token=cfg.get("session_token") or None,
        region_name=source.region or None,
        endpoint_url=cfg.get("endpoint_url") or None,  # MinIO / S3-compatible
        config=Config(connect_timeout=HTTP_TIMEOUT, read_timeout=HTTP_TIMEOUT, retries={"max_attempts": 1}),
    )
    if bucket:
        client.head_bucket(Bucket=bucket)
        return True, f"Connected — bucket '{bucket}' is reachable."
    resp = client.list_buckets()
    n = len(resp.get("Buckets", []))
    return True, f"Connected — {n} bucket(s) visible."


def _test_azure_blob(source: DataSource) -> tuple[bool, str]:
    from azure.storage.blob import BlobServiceClient

    cfg = _cfg(source)
    conn_str = cfg.get("connection_string")
    if conn_str:
        svc = BlobServiceClient.from_connection_string(conn_str)
    else:
        account = source.username
        key = _secret(source)
        if not account or not key:
            raise ValueError("Provide the storage account name (username) and key (password), "
                             "or a connection_string in Advanced configuration.")
        svc = BlobServiceClient(
            account_url=f"https://{account}.blob.core.windows.net", credential=key
        )
    container, _ = _bucket_and_prefix(source.host)
    if container:
        props = svc.get_container_client(container).get_container_properties()
        return True, f"Connected — container '{props.name}' is reachable."
    next(iter(svc.list_containers(results_per_page=1)), None)
    return True, "Connected — storage account is reachable."


def _test_gcs(source: DataSource) -> tuple[bool, str]:
    from google.cloud import storage
    from google.oauth2 import service_account

    info = _service_account_info(source)
    creds = service_account.Credentials.from_service_account_info(info)
    project = _cfg(source).get("project") or info.get("project_id")
    client = storage.Client(project=project, credentials=creds)
    bucket, _ = _bucket_and_prefix(source.host)
    if bucket:
        if client.lookup_bucket(bucket) is None:
            return False, f"Bucket '{bucket}' not found or not accessible."
        return True, f"Connected — bucket '{bucket}' is reachable."
    next(iter(client.list_buckets(max_results=1)), None)
    return True, "Connected — project is reachable."


def _test_gdrive(source: DataSource) -> tuple[bool, str]:
    """Google Drive via the customer's own OAuth credentials (direct entry):
      client_id + client_secret in extra_config, refresh_token in the encrypted
      password field. We exchange the refresh token for an access token and call
      the Drive API to confirm the credentials work.

    To obtain these: create a project in Google Cloud Console, enable the Google
    Drive API, create an OAuth 2.0 Client ID, and generate a refresh token
    (e.g. via the OAuth Playground)."""
    import httpx

    cfg = _cfg(source)
    client_id = cfg.get("client_id")
    client_secret = cfg.get("client_secret")
    refresh_token = _secret(source)
    if not (client_id and client_secret and refresh_token):
        raise ValueError(
            "Provide the OAuth Client ID, Client Secret and Refresh Token for Google Drive."
        )

    token_resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=HTTP_TIMEOUT,
    )
    if token_resp.status_code != 200:
        return False, f"Token refresh failed: {token_resp.text[:200]}"
    access_token = token_resp.json().get("access_token")
    about = httpx.get(
        "https://www.googleapis.com/drive/v3/about",
        params={"fields": "user(emailAddress)"},
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=HTTP_TIMEOUT,
    )
    if about.status_code != 200:
        return False, f"Drive API error: {about.text[:200]}"
    email = about.json().get("user", {}).get("emailAddress", "unknown")
    return True, f"Connected to Google Drive as {email}."


def _test_sftp(source: DataSource) -> tuple[bool, str]:
    import io

    import paramiko

    if not source.host:
        raise ValueError("SFTP host is required.")
    cfg = _cfg(source)
    transport = paramiko.Transport((source.host, source.port or 22))
    try:
        pkey = None
        if cfg.get("private_key"):
            pkey = paramiko.RSAKey.from_private_key(io.StringIO(cfg["private_key"]))
        transport.connect(username=source.username or None, password=_secret(source) or None, pkey=pkey)
        sftp = paramiko.SFTPClient.from_transport(transport)
        path = cfg.get("path") or "."
        entries = sftp.listdir(path)
        return True, f"Connected — {len(entries)} item(s) in '{path}'."
    finally:
        transport.close()


# --------------------------------------------------------------------------- #
# api
# --------------------------------------------------------------------------- #

def _http_auth(source: DataSource) -> dict[str, str]:
    """Build an auth header. username = header name (default Authorization);
    password = its value. If username is blank but password set, send Bearer."""
    secret = _secret(source)
    if not secret:
        return {}
    header_name = (source.username or "Authorization").strip()
    if header_name.lower() == "authorization" and not secret.lower().startswith(("bearer ", "basic ")):
        return {"Authorization": f"Bearer {secret}"}
    return {header_name: secret}


def _test_api(source: DataSource) -> tuple[bool, str]:
    import httpx

    url = source.host
    if not url:
        raise ValueError("Base URL / endpoint is required.")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    cfg = _cfg(source)
    verify = cfg.get("verify_ssl", True)
    headers = _http_auth(source)

    st = source.source_type
    try:
        if st == "graphql":
            r = httpx.post(url, json={"query": "{__typename}"}, headers=headers,
                           timeout=HTTP_TIMEOUT, verify=verify)
        elif st == "soap":
            wsdl = url if "?wsdl" in url.lower() else url + "?wsdl"
            r = httpx.get(wsdl, headers=headers, timeout=HTTP_TIMEOUT, verify=verify)
        else:  # rest / other_api
            path = cfg.get("health_path", "")
            r = httpx.get(url + path, headers=headers, timeout=HTTP_TIMEOUT,
                          verify=verify, follow_redirects=True)
    except httpx.HTTPError as exc:
        return False, f"Endpoint unreachable: {exc}"

    if r.status_code >= 500:
        return False, f"Endpoint returned server error {r.status_code}."
    if r.status_code in (401, 403):
        return False, f"Reachable but unauthorized (HTTP {r.status_code}) — check credentials."
    return True, f"Connected — endpoint responded with HTTP {r.status_code}."


# --------------------------------------------------------------------------- #
# logs
# --------------------------------------------------------------------------- #

def _test_logs(source: DataSource) -> tuple[bool, str]:
    st = source.source_type
    if st == "cloudwatch":
        return _test_cloudwatch(source)
    if st == "azure_monitor":
        return _test_azure_monitor(source)
    if st == "gcp_logging":
        return _test_gcp_logging(source)
    if st == "splunk":
        return _test_splunk(source)
    # other_logs → generic HTTP probe against host
    return _test_api(source)


def _test_cloudwatch(source: DataSource) -> tuple[bool, str]:
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "logs",
        aws_access_key_id=source.username or None,
        aws_secret_access_key=_secret(source) or None,
        aws_session_token=_cfg(source).get("session_token") or None,
        region_name=source.region or None,
        config=Config(connect_timeout=HTTP_TIMEOUT, read_timeout=HTTP_TIMEOUT, retries={"max_attempts": 1}),
    )
    resp = client.describe_log_groups(limit=1)
    n = len(resp.get("logGroups", []))
    return True, f"Connected — CloudWatch reachable ({n}+ log group(s))."


def _test_azure_monitor(source: DataSource) -> tuple[bool, str]:
    from datetime import timedelta

    from azure.identity import ClientSecretCredential
    from azure.monitor.query import LogsQueryClient

    cfg = _cfg(source)
    tenant = cfg.get("tenant_id")
    client_id = cfg.get("client_id")
    workspace = cfg.get("workspace_id")
    secret = _secret(source)
    if not (tenant and client_id and secret and workspace):
        raise ValueError("Azure Monitor needs tenant_id, client_id, workspace_id (Advanced "
                         "configuration) and the client secret (password).")
    cred = ClientSecretCredential(tenant_id=tenant, client_id=client_id, client_secret=secret)
    client = LogsQueryClient(cred)
    client.query_workspace(workspace, "print 1", timespan=timedelta(minutes=5))
    return True, "Connected — Azure Monitor workspace is reachable."


def _test_gcp_logging(source: DataSource) -> tuple[bool, str]:
    from google.cloud import logging as gcloud_logging
    from google.oauth2 import service_account

    info = _service_account_info(source)
    creds = service_account.Credentials.from_service_account_info(info)
    project = _cfg(source).get("project") or info.get("project_id")
    client = gcloud_logging.Client(project=project, credentials=creds)
    next(iter(client.list_entries(max_results=1, page_size=1)), None)
    return True, f"Connected — GCP Logging reachable (project {project})."


def _test_splunk(source: DataSource) -> tuple[bool, str]:
    import httpx

    base = source.host
    if not base:
        raise ValueError("Splunk base URL is required (e.g. https://host:8089).")
    if not base.startswith(("http://", "https://")):
        base = "https://" + base
    cfg = _cfg(source)
    verify = cfg.get("verify_ssl", False)  # Splunk mgmt port often self-signed
    secret = _secret(source)
    headers = {}
    auth = None
    if source.username:
        auth = (source.username, secret)
    elif secret:
        headers["Authorization"] = f"Bearer {secret}"
    r = httpx.get(f"{base.rstrip('/')}/services/server/info", params={"output_mode": "json"},
                  headers=headers, auth=auth, timeout=HTTP_TIMEOUT, verify=verify)
    if r.status_code in (401, 403):
        return False, f"Reachable but unauthorized (HTTP {r.status_code})."
    if r.status_code >= 400:
        return False, f"Splunk returned HTTP {r.status_code}."
    return True, "Connected — Splunk management API is reachable."


# --------------------------------------------------------------------------- #
# upload
# --------------------------------------------------------------------------- #

def _test_upload(source: DataSource) -> tuple[bool, str]:
    path = _cfg(source).get("stored_path")
    if not path:
        return False, "No file is associated with this source."
    p = Path(path)
    if not p.exists():
        return False, "The uploaded file is missing on the server."
    size = p.stat().st_size
    mb = size / (1024 * 1024)
    return True, f"File present ({mb:.2f} MB)."
