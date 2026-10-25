"""Local verification of ZeroShield bundle decision tokens (HS256, per-property secret)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt

TOKEN_TYPE = "zs_decision_bundle"
DEFAULT_ALGORITHM = "HS256"


@dataclass(frozen=True)
class DecisionTokenPayload:
    property_id: UUID
    principal_fingerprint: str
    purpose_rights: dict[str, bool]
    issued_at: datetime
    expires_at: datetime

    @property
    def expires_in(self) -> int:
        return max(0, int((self.expires_at - datetime.now(timezone.utc)).total_seconds()))


def verify_decision_token(
    token: str,
    *,
    signing_secret: str,
    expected_property_id: str | UUID | None = None,
    algorithm: str = DEFAULT_ALGORITHM,
) -> DecisionTokenPayload | None:
    """Verify signature and expiry; return parsed payload or None."""
    try:
        raw: dict[str, Any] = jwt.decode(token, signing_secret, algorithms=[algorithm])
        if raw.get("type") != TOKEN_TYPE:
            return None
        property_id = UUID(str(raw["prop"]))
        if expected_property_id is not None and str(property_id) != str(expected_property_id):
            return None
        prn = str(raw["prn"])
        prp = raw.get("prp") or {}
        if not isinstance(prp, dict):
            return None
        purpose_rights = {str(k): bool(v) for k, v in prp.items()}
        iat = raw.get("iat")
        exp = raw.get("exp")
        issued_at = (
            datetime.fromtimestamp(iat, tz=timezone.utc)
            if isinstance(iat, (int, float))
            else datetime.now(timezone.utc)
        )
        expires_at = (
            datetime.fromtimestamp(exp, tz=timezone.utc)
            if isinstance(exp, (int, float))
            else issued_at
        )
        return DecisionTokenPayload(
            property_id=property_id,
            principal_fingerprint=prn,
            purpose_rights=purpose_rights,
            issued_at=issued_at,
            expires_at=expires_at,
        )
    except (JWTError, ValueError, KeyError, TypeError):
        return None


def lookup_purpose_allowed(payload: DecisionTokenPayload, purpose_key: str) -> bool | None:
    if purpose_key in payload.purpose_rights:
        return payload.purpose_rights[purpose_key]
    return None


def is_purpose_allowed(
    token: str,
    *,
    signing_secret: str,
    property_id: str | UUID,
    purpose_key: str,
) -> bool | None:
    """Convenience helper for middleware: True/False if known, None if token invalid."""
    payload = verify_decision_token(
        token,
        signing_secret=signing_secret,
        expected_property_id=property_id,
    )
    if payload is None:
        return None
    return lookup_purpose_allowed(payload, purpose_key)


def mint_decision_token(
    *,
    property_id: UUID,
    signing_secret: str,
    principal_fingerprint: str,
    purpose_rights: dict[str, bool],
    ttl_seconds: int = 900,
    algorithm: str = DEFAULT_ALGORITHM,
) -> tuple[str, int]:
    """Mint a bundle token (used in tests and local integrations)."""
    from datetime import datetime, timedelta, timezone

    from jose import jwt

    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=ttl_seconds)
    payload: dict[str, Any] = {
        "type": TOKEN_TYPE,
        "prop": str(property_id),
        "prn": principal_fingerprint,
        "prp": purpose_rights,
        "iat": int(now.timestamp()),
        "exp": expire,
    }
    token = jwt.encode(payload, signing_secret, algorithm=algorithm)
    return token, ttl_seconds
