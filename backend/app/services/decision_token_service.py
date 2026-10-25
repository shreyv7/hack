"""Per-property HS256 decision tokens — bundle format for local verification."""

from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.crypto import decrypt_secret, encrypt_secret
from app.models.integration_property import IntegrationProperty

TOKEN_TYPE = "zs_decision_bundle"


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


def ensure_property_decision_secret(db: Session, property_obj: IntegrationProperty) -> str:
    """Return plaintext signing secret, generating and persisting one if missing."""
    if property_obj.decision_signing_secret_encrypted:
        return decrypt_secret(property_obj.decision_signing_secret_encrypted)

    secret = secrets.token_urlsafe(48)
    property_obj.decision_signing_secret_encrypted = encrypt_secret(secret)
    db.add(property_obj)
    db.commit()
    db.refresh(property_obj)
    return secret


def mint_decision_token(
    *,
    property_id: UUID,
    signing_secret: str,
    principal_fingerprint: str,
    purpose_rights: dict[str, bool],
    ttl_seconds: int | None = None,
) -> tuple[str, int]:
    """Mint a bundle token covering all purpose decisions for one principal."""
    ttl = ttl_seconds if ttl_seconds is not None else settings.DECISION_TOKEN_TTL_SECONDS
    now = datetime.now(timezone.utc)
    expire = now + timedelta(seconds=ttl)
    payload: dict[str, Any] = {
        "type": TOKEN_TYPE,
        "prop": str(property_id),
        "prn": principal_fingerprint,
        "prp": purpose_rights,
        "iat": int(now.timestamp()),
        "exp": expire,
    }
    token = jwt.encode(payload, signing_secret, algorithm=settings.ALGORITHM)
    return token, ttl


def decode_decision_token(signing_secret: str, token: str) -> DecisionTokenPayload | None:
    """Verify signature and parse a bundle decision token."""
    try:
        raw = jwt.decode(token, signing_secret, algorithms=[settings.ALGORITHM])
        if raw.get("type") != TOKEN_TYPE:
            return None
        property_id = UUID(str(raw["prop"]))
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
            else issued_at + timedelta(seconds=settings.DECISION_TOKEN_TTL_SECONDS)
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
    """Return allowed flag from token prp map, trying UUID and name keys."""
    if purpose_key in payload.purpose_rights:
        return payload.purpose_rights[purpose_key]
    return None
