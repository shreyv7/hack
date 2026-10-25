"""
List + download files from a connected file-store data source so the PII Scanner
can parse and scan their contents (the same pipeline used for direct uploads).

`iter_files(source)` yields (filename, bytes) for each supported, in-size-limit
file across S3 / GCS / Azure Blob / Google Drive / SFTP. Bounded by MAX_FILES and
MAX_FILE_BYTES so a huge bucket can't blow up a scan.
"""

from __future__ import annotations

import json
import logging
import posixpath
import stat
from typing import Iterator

from app.core.crypto import decrypt_secret
from app.models.data_source import DataSource
from app.services import file_scanner

logger = logging.getLogger(__name__)

MAX_FILES = 100                       # files scanned per run
MAX_FILE_BYTES = 15 * 1024 * 1024     # skip anything larger
HTTP_TIMEOUT = 15.0

# Google native docs need exporting to a parseable format.
_GOOGLE_EXPORT = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
}


def _cfg(source: DataSource) -> dict:
    return source.extra_config or {}


def _secret(source: DataSource) -> str:
    return decrypt_secret(source.password) if source.password else ""


def _bucket_and_prefix(host: str | None) -> tuple[str, str]:
    if not host:
        return "", ""
    parts = host.strip("/").split("/", 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def _wanted(name: str, size: int | None) -> bool:
    if name.endswith("/"):
        return False
    if not file_scanner.is_supported(name):
        return False
    if size is not None and size > MAX_FILE_BYTES:
        return False
    return True


def iter_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
    st = source.source_type
    if st == "s3":
        yield from _s3_files(source)
    elif st == "gcs":
        yield from _gcs_files(source)
    elif st == "azure_blob":
        yield from _azure_files(source)
    elif st == "gdrive":
        yield from _gdrive_files(source)
    elif st == "sftp":
        yield from _sftp_files(source)
    else:
        raise ValueError(f"File scanning is not supported for '{st}' sources.")


# --------------------------------------------------------------------------- #
# S3
# --------------------------------------------------------------------------- #

def _s3_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
    import boto3
    from botocore.config import Config

    cfg = _cfg(source)
    bucket, prefix = _bucket_and_prefix(source.host)
    if not bucket:
        raise ValueError("Set the S3 bucket (in the host field) to scan its files.")
    client = boto3.client(
        "s3",
        aws_access_key_id=source.username or None,
        aws_secret_access_key=_secret(source) or None,
        aws_session_token=cfg.get("session_token") or None,
        region_name=source.region or None,
        endpoint_url=cfg.get("endpoint_url") or None,
        config=Config(connect_timeout=HTTP_TIMEOUT, read_timeout=HTTP_TIMEOUT, retries={"max_attempts": 2}),
    )
    count = 0
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix or ""):
        for obj in page.get("Contents", []):
            if not _wanted(obj["Key"], obj.get("Size")):
                continue
            data = client.get_object(Bucket=bucket, Key=obj["Key"])["Body"].read()
            yield obj["Key"], data
            count += 1
            if count >= MAX_FILES:
                return


# --------------------------------------------------------------------------- #
# Google Cloud Storage
# --------------------------------------------------------------------------- #

def _gcs_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
    from google.cloud import storage
    from google.oauth2 import service_account

    cfg = _cfg(source)
    raw = cfg.get("service_account_json")
    if not raw:
        raise ValueError("Provide the service-account JSON in Advanced configuration.")
    info = raw if isinstance(raw, dict) else json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info)
    bucket_name, prefix = _bucket_and_prefix(source.host)
    if not bucket_name:
        raise ValueError("Set the GCS bucket (in the host field) to scan its files.")
    client = storage.Client(project=cfg.get("project") or info.get("project_id"), credentials=creds)
    count = 0
    for blob in client.list_blobs(bucket_name, prefix=prefix or None):
        if not _wanted(blob.name, blob.size):
            continue
        yield blob.name, blob.download_as_bytes()
        count += 1
        if count >= MAX_FILES:
            return


# --------------------------------------------------------------------------- #
# Azure Blob Storage
# --------------------------------------------------------------------------- #

def _azure_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
    from azure.storage.blob import BlobServiceClient

    cfg = _cfg(source)
    conn_str = cfg.get("connection_string")
    if conn_str:
        svc = BlobServiceClient.from_connection_string(conn_str)
    else:
        account, key = source.username, _secret(source)
        if not account or not key:
            raise ValueError("Provide the storage account name and key (or a connection_string).")
        svc = BlobServiceClient(account_url=f"https://{account}.blob.core.windows.net", credential=key)
    container, prefix = _bucket_and_prefix(source.host)
    if not container:
        raise ValueError("Set the Azure container (in the host field) to scan its files.")
    cc = svc.get_container_client(container)
    count = 0
    for blob in cc.list_blobs(name_starts_with=prefix or None):
        size = getattr(blob, "size", None)
        if not _wanted(blob.name, size):
            continue
        data = cc.download_blob(blob.name).readall()
        yield blob.name, data
        count += 1
        if count >= MAX_FILES:
            return


# --------------------------------------------------------------------------- #
# Google Drive
# --------------------------------------------------------------------------- #

def _gdrive_access_token(source: DataSource) -> str:
    import httpx

    cfg = _cfg(source)
    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": cfg.get("client_id"),
            "client_secret": cfg.get("client_secret"),
            "refresh_token": _secret(source),
            "grant_type": "refresh_token",
        },
        timeout=HTTP_TIMEOUT,
    )
    if resp.status_code != 200:
        raise ValueError(f"Google token refresh failed: {resp.text[:200]}")
    return resp.json()["access_token"]


def _gdrive_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
    import httpx

    token = _gdrive_access_token(source)
    headers = {"Authorization": f"Bearer {token}"}
    folder = _cfg(source).get("folder_id")
    q = "trashed = false"
    if folder:
        q += f" and '{folder}' in parents"

    count = 0
    page_token: str | None = None
    with httpx.Client(timeout=HTTP_TIMEOUT, headers=headers) as client:
        while True:
            params = {
                "q": q,
                "fields": "files(id,name,mimeType,size),nextPageToken",
                "pageSize": 100,
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if page_token:
                params["pageToken"] = page_token
            r = client.get("https://www.googleapis.com/drive/v3/files", params=params)
            if r.status_code != 200:
                raise ValueError(f"Drive list failed: {r.text[:200]}")
            body = r.json()
            for f in body.get("files", []):
                mime = f.get("mimeType", "")
                name = f.get("name", f["id"])
                size = int(f["size"]) if f.get("size") else None
                if mime in _GOOGLE_EXPORT:
                    export_mime, ext = _GOOGLE_EXPORT[mime]
                    er = client.get(
                        f"https://www.googleapis.com/drive/v3/files/{f['id']}/export",
                        params={"mimeType": export_mime},
                    )
                    if er.status_code != 200:
                        continue
                    yield name + ext, er.content
                    count += 1
                else:
                    if not _wanted(name, size):
                        continue
                    dr = client.get(
                        f"https://www.googleapis.com/drive/v3/files/{f['id']}",
                        params={"alt": "media", "supportsAllDrives": "true"},
                    )
                    if dr.status_code != 200:
                        continue
                    yield name, dr.content
                    count += 1
                if count >= MAX_FILES:
                    return
            page_token = body.get("nextPageToken")
            if not page_token:
                return


# --------------------------------------------------------------------------- #
# SFTP
# --------------------------------------------------------------------------- #

def _sftp_files(source: DataSource) -> Iterator[tuple[str, bytes]]:
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
        count = 0
        for entry in sftp.listdir_attr(path):
            if stat.S_ISDIR(entry.st_mode):
                continue
            if not _wanted(entry.filename, entry.st_size):
                continue
            with sftp.open(posixpath.join(path, entry.filename), "rb") as fh:
                data = fh.read()
            yield entry.filename, data
            count += 1
            if count >= MAX_FILES:
                return
    finally:
        transport.close()
