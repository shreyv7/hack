"""
Security helpers — password hashing and JWT creation/decoding.
"""

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def _build_payload(
    subject: str,
    token_type: str,
    expire: datetime,
    *,
    role: str,
    org_id: str | None,
    jti: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": expire,
        "type": token_type,
        "role": role,
        "org_id": org_id,
    }
    if jti:
        payload["jti"] = jti
    return payload


def create_access_token(
    subject: str,
    *,
    role: str,
    org_id: UUID | None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    org_id_str = str(org_id) if org_id is not None else None
    payload = _build_payload(subject, "access", expire, role=role, org_id=org_id_str)
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(
    subject: str,
    *,
    role: str,
    org_id: UUID | None,
    expires_delta: timedelta | None = None,
    jti: str | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    )
    org_id_str = str(org_id) if org_id is not None else None
    token_jti = jti or str(uuid4())
    payload = _build_payload(
        subject, "refresh", expire, role=role, org_id=org_id_str, jti=token_jti
    )
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict[str, Any] | None:
    """Return the token payload, or None if it is invalid/expired."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


def create_cmp_session_token(property_id: UUID | str, origin: str, ttl_minutes: int = 30) -> str:
    """Create short-lived session token for CMP SDK in-browser fetch calls."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    payload = {
        "sub": str(property_id),
        "type": "cmp_session",
        "origin": origin,
        "exp": expire,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_cmp_session_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a CMP session token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "cmp_session":
            return None
        return payload
    except JWTError:
        return None

