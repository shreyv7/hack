"""Shared OTP generation, hashing, and validation helpers."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.core.config import settings

OTP_EXPIRY_MINUTES = 15
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60
OTP_MAX_SENDS = 10
OTP_VERIFIED_TOKEN_TTL_MINUTES = 30


class OtpService:
    @staticmethod
    def generate_otp() -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    @staticmethod
    def hash_otp(otp: str, salt: str) -> str:
        raw = f"{otp}:{salt}:{settings.SECRET_KEY}"
        return hashlib.sha256(raw.encode()).hexdigest()

    @staticmethod
    def otp_expires_at(from_time: datetime | None = None) -> datetime:
        base = from_time or datetime.now(timezone.utc)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)
        return base + timedelta(minutes=OTP_EXPIRY_MINUTES)

    @staticmethod
    def verify_otp_code(
        *,
        submitted: str,
        stored_hash: str | None,
        salt: str,
        expires_at: datetime | None,
        attempts: int,
    ) -> None:
        if not stored_hash or not expires_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No OTP issued for this session")
        if attempts >= OTP_MAX_ATTEMPTS:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Maximum OTP attempts exceeded")
        now = datetime.now(timezone.utc)
        exp = expires_at if expires_at.tzinfo else expires_at.replace(tzinfo=timezone.utc)
        if now > exp:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OTP has expired")
        expected = OtpService.hash_otp(submitted.strip(), salt)
        if expected != stored_hash:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code")

    @staticmethod
    def can_resend(last_sent_at: datetime | None, sent_count: int) -> None:
        if sent_count >= OTP_MAX_SENDS:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="Maximum OTP resends exceeded")
        if last_sent_at is None:
            return
        now = datetime.now(timezone.utc)
        last = last_sent_at if last_sent_at.tzinfo else last_sent_at.replace(tzinfo=timezone.utc)
        elapsed = (now - last).total_seconds()
        if elapsed < OTP_RESEND_COOLDOWN_SECONDS:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {int(OTP_RESEND_COOLDOWN_SECONDS - elapsed)} seconds before resending",
            )

    @staticmethod
    def create_verified_token(session_id: str) -> str:
        expires = datetime.now(timezone.utc) + timedelta(minutes=OTP_VERIFIED_TOKEN_TTL_MINUTES)
        payload = f"{session_id}|{expires.isoformat()}"
        sig = hashlib.sha256(f"{payload}:{settings.SECRET_KEY}".encode()).hexdigest()
        return f"{payload}|{sig}"

    @staticmethod
    def parse_verified_token_session_id(token: str) -> str:
        parts = token.split("|")
        if len(parts) != 3:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid OTP verified token")
        return parts[0]

    @staticmethod
    def validate_verified_token(token: str, session_id: str) -> None:
        parts = token.split("|")
        if len(parts) != 3:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid OTP verified token")
        tok_session, exp_str, sig = parts
        if tok_session != session_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OTP verified token session mismatch")
        payload = f"{tok_session}|{exp_str}"
        expected_sig = hashlib.sha256(f"{payload}:{settings.SECRET_KEY}".encode()).hexdigest()
        if sig != expected_sig:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid OTP verified token signature")
        expires = datetime.fromisoformat(exp_str)
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expires:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OTP verified token has expired")
