"""Consent evaluation — local token verify with Decision API fallback."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib import error, request

from zeroshield.config import ZeroShieldConfig
from zeroshield.token import DecisionTokenPayload, lookup_purpose_allowed, verify_decision_token


@dataclass(frozen=True)
class ConsentEvaluation:
    allowed: bool
    effective_mode: str
    decision: str
    source: str
    purpose_key: str
    principal_fingerprint: str | None = None
    decision_token: str | None = None

    @property
    def should_block(self) -> bool:
        return self.effective_mode == "enforced" and not self.allowed


def _fetch_decision_api(
    *,
    config: ZeroShieldConfig,
    purpose_key: str,
    token: str | None,
    session_id: str | None,
    principal_email: str | None,
    principal_phone: str | None,
) -> dict[str, Any]:
    url = f"{config.api_url}/integrations/{config.property_id}/consent/decision"
    body: dict[str, Any] = {"purpose_key": purpose_key}
    if session_id:
        body["session_id"] = session_id
    if principal_email:
        body["principal_email"] = principal_email
    if principal_phone:
        body["principal_phone"] = principal_phone

    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["X-API-Key"] = config.api_key
    if token:
        headers["X-ZS-Decision-Token"] = token

    req = request.Request(
        url,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read().decode())
    except error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Decision API failed ({exc.code}): {detail}") from exc


def _fetch_suppression_check(
    *,
    config: ZeroShieldConfig,
    purpose_key: str,
    identifiers: list[dict[str, str | None]],
) -> dict[str, Any]:
    url = f"{config.api_url}/integrations/{config.property_id}/consent/suppression-check"
    body = {"purpose_key": purpose_key, "identifiers": identifiers}
    headers = {"Content-Type": "application/json"}
    if config.api_key:
        headers["X-API-Key"] = config.api_key

    req = request.Request(
        url,
        data=json.dumps(body).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except error.HTTPError as exc:
        detail = exc.read().decode()
        raise RuntimeError(f"Suppression check API failed ({exc.code}): {detail}") from exc


def filter_consented(
    *,
    purpose_key: str,
    identifiers: list[dict[str, str | None]],
    config: ZeroShieldConfig | None = None,
) -> list[dict[str, Any]]:
    """Return only identifiers allowed for the given purpose (marketing-send filter).

    Each identifier dict may include ``ref``, ``principal_email``, and/or ``principal_phone``.
    """
    cfg = config or ZeroShieldConfig.from_env()
    data = _fetch_suppression_check(
        config=cfg,
        purpose_key=purpose_key,
        identifiers=identifiers,
    )
    allowed_refs: list[dict[str, Any]] = []
    for row in data.get("results", []):
        if row.get("allowed"):
            allowed_refs.append(row)
    return allowed_refs


def evaluate_consent(
    *,
    purpose_key: str,
    config: ZeroShieldConfig,
    token: str | None = None,
    session_id: str | None = None,
    principal_email: str | None = None,
    principal_phone: str | None = None,
) -> ConsentEvaluation:
    """Verify decision token locally; fall back to Decision API when needed."""
    resolved_session = session_id or config.default_session_id
    payload: DecisionTokenPayload | None = None
    if token:
        payload = verify_decision_token(
            token,
            signing_secret=config.decision_secret,
            expected_property_id=config.property_id,
        )
        if payload is not None:
            allowed = lookup_purpose_allowed(payload, purpose_key)
            if allowed is True:
                return ConsentEvaluation(
                    allowed=True,
                    effective_mode="disabled",
                    decision="allowed",
                    source="token",
                    purpose_key=purpose_key,
                    principal_fingerprint=payload.principal_fingerprint,
                    decision_token=token,
                )

    data = _fetch_decision_api(
        config=config,
        purpose_key=purpose_key,
        token=token if payload else None,
        session_id=resolved_session,
        principal_email=principal_email,
        principal_phone=principal_phone,
    )
    return ConsentEvaluation(
        allowed=bool(data.get("allowed")),
        effective_mode=str(data.get("effective_mode", "disabled")),
        decision=str(data.get("decision", "denied")),
        source=str(data.get("source", "api")),
        purpose_key=purpose_key,
        principal_fingerprint=data.get("principal_fingerprint"),
        decision_token=data.get("decision_token"),
    )
