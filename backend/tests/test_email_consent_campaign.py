"""Tests for email consent campaign channel."""

from __future__ import annotations

import base64
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.services.campaign_recipient_service import (
    MAX_CAMPAIGN_RECIPIENTS,
    dedupe_recipients,
    normalize_recipient_row,
)
from app.services.delivery_token_service import mint_delivery_token, parse_delivery_token


def test_normalize_recipient_row_requires_email_or_phone():
    assert normalize_recipient_row(email="user@example.com", name="User") is not None
    assert normalize_recipient_row(email="bad-email", name="User") is None
    assert normalize_recipient_row(phone="+919876543210", name="User") is not None


def test_dedupe_recipients_by_id():
    rows = [
        {"id": "a@b.com", "name": "A", "email": "a@b.com"},
        {"id": "a@b.com", "name": "A2", "email": "a@b.com"},
        {"id": "c@d.com", "name": "C", "email": "c@d.com"},
    ]
    assert len(dedupe_recipients(rows)) == 2


def test_delivery_token_mint_and_parse():
    delivery_id = uuid4()
    property_id = uuid4()
    org_id = uuid4()
    token = mint_delivery_token(
        delivery_id=delivery_id,
        property_id=property_id,
        organization_id=org_id,
    )
    parsed = parse_delivery_token(token)
    assert parsed["delivery_id"] == str(delivery_id)
    assert parsed["property_id"] == str(property_id)


def test_delivery_token_rejects_tampered_signature():
    delivery_id = uuid4()
    property_id = uuid4()
    org_id = uuid4()
    token = mint_delivery_token(
        delivery_id=delivery_id,
        property_id=property_id,
        organization_id=org_id,
    )
    tampered = token[:-4] + "xxxx"
    with pytest.raises(HTTPException):
        parse_delivery_token(tampered)


def test_delivery_token_rejects_expired():
    exp = int((datetime.now(timezone.utc) - timedelta(days=1)).timestamp())
    payload = f"{uuid4()}:{uuid4()}:{uuid4()}:{exp}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode().rstrip("=")
    with pytest.raises(HTTPException) as exc:
        parse_delivery_token(token)
    assert exc.value.status_code == 410


def test_max_campaign_recipients_cap_is_defined():
    assert MAX_CAMPAIGN_RECIPIENTS == 5000
