"""Signed delivery tokens for email consent campaign links."""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status

from app.core.config import settings

TOKEN_TTL_DAYS = 7


def mint_delivery_token(*, delivery_id: UUID, property_id: UUID, organization_id: UUID) -> str:
    exp = int((datetime.now(timezone.utc) + timedelta(days=TOKEN_TTL_DAYS)).timestamp())
    payload = f"{delivery_id}:{property_id}:{organization_id}:{exp}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    raw = f"{payload}:{sig}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def parse_delivery_token(token: str) -> dict[str, str | int]:
    try:
        padded = token + "=" * (-len(token) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode()).decode()
        parts = decoded.split(":")
        if len(parts) != 5:
            raise ValueError("invalid token shape")
        delivery_id, property_id, organization_id, exp_str, sig = parts
        payload = f"{delivery_id}:{property_id}:{organization_id}:{exp_str}"
        expected = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            raise ValueError("invalid signature")
        exp = int(exp_str)
        if datetime.now(timezone.utc).timestamp() > exp:
            raise HTTPException(status.HTTP_410_GONE, detail="This consent link has expired")
        return {
            "delivery_id": delivery_id,
            "property_id": property_id,
            "organization_id": organization_id,
            "exp": exp,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid consent link") from exc
