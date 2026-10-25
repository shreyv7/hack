"""SMS delivery for data-rights portal verification and notifications."""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def send_otp_sms(to_phone: str, otp_code: str) -> bool:
    """Send OTP via SMS. Logs when no SMS provider is configured (dev)."""
    message = (
        f"Your DPDPA Shield verification code is {otp_code}. "
        "Expires in 15 minutes. Do not share this code."
    )
    logger.warning(
        "SMS provider not configured — OTP to %s: %s",
        to_phone,
        message,
    )
    return False


def send_request_accepted_sms(to_phone: str, tracking_id: str) -> bool:
    message = (
        f"DPDPA Shield: Your request has been accepted. Request ID: {tracking_id}. "
        "Keep this ID to check status."
    )
    logger.warning("SMS provider not configured — acceptance SMS to %s: %s", to_phone, message)
    return False


def send_status_update_sms(to_phone: str, tracking_id: str, status_message: str) -> bool:
    message = f"DPDPA Shield update for {tracking_id}: {status_message}"
    logger.warning("SMS provider not configured — status SMS to %s: %s", to_phone, message)
    return False


def send_closure_sms(to_phone: str, tracking_id: str) -> bool:
    message = (
        f"DPDPA Shield: Your request {tracking_id} has been closed. "
        "A closure letter has been sent to your email."
    )
    logger.warning("SMS provider not configured — closure SMS to %s: %s", to_phone, message)
    return False


def normalize_phone(phone: str) -> str:
    from app.utils.india_phone import normalize_india_phone

    return normalize_india_phone(phone)
