"""
Fetch data from a connected REST API so the PII Scanner can scan the responses.

`fetch_api(source)` GETs the base URL plus any configured `scan_paths`, and yields
(filename, bytes) for each response — JSON responses are named *.json (so arrays
of records are scanned column-by-column) and everything else *.txt (free-text
scan). Auth: username = header name (default Authorization), password = its value
(sent as Bearer when it's a bare token).
"""

from __future__ import annotations

import logging
from typing import Iterator

from app.core.crypto import decrypt_secret
from app.models.data_source import DataSource

logger = logging.getLogger(__name__)

MAX_PATHS = 20
MAX_RESPONSE_BYTES = 5 * 1024 * 1024
HTTP_TIMEOUT = 15.0


def _cfg(source: DataSource) -> dict:
    return source.extra_config or {}


def _secret(source: DataSource) -> str:
    return decrypt_secret(source.password) if source.password else ""


def _auth_headers(source: DataSource) -> dict[str, str]:
    secret = _secret(source)
    if not secret:
        return {}
    header_name = (source.username or "Authorization").strip()
    if header_name.lower() == "authorization" and not secret.lower().startswith(("bearer ", "basic ")):
        return {"Authorization": f"Bearer {secret}"}
    return {header_name: secret}


def fetch_api(source: DataSource) -> Iterator[tuple[str, bytes]]:
    import httpx

    base = source.host
    if not base:
        raise ValueError("Set the API base URL to scan it.")
    if not base.startswith(("http://", "https://")):
        base = "https://" + base
    base = base.rstrip("/")

    cfg = _cfg(source)
    paths = cfg.get("scan_paths") or [""]
    if not isinstance(paths, list):
        raise ValueError("extra_config.scan_paths must be a list of URL paths.")
    verify = cfg.get("verify_ssl", True)
    headers = _auth_headers(source)

    with httpx.Client(timeout=HTTP_TIMEOUT, headers=headers, verify=verify, follow_redirects=True) as client:
        for raw_path in paths[:MAX_PATHS]:
            path = str(raw_path)
            url = base + (path if path.startswith("/") or path == "" else "/" + path)
            try:
                r = client.get(url)
            except httpx.HTTPError as exc:
                logger.info("API scan GET failed for %s: %s", url, exc)
                continue
            if r.status_code >= 400:
                continue
            content = r.content[:MAX_RESPONSE_BYTES]
            if not content.strip():
                continue
            ctype = r.headers.get("content-type", "").lower()
            is_json = "json" in ctype or content.lstrip()[:1] in (b"{", b"[")
            ext = ".json" if is_json else ".txt"
            label = (path.strip("/") or "response").replace("/", "_")
            yield f"{label}{ext}", content
