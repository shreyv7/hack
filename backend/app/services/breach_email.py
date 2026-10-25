"""Breach disclosure notification emails."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_breach_email(to_email: str, subject: str, body: str) -> bool:
    if not settings.smtp_ready:
        logger.warning("Breach email (no SMTP) to %s: %s — %s", to_email, subject, body[:200])
        return False
    try:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        message["To"] = to_email
        message.set_content(body)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.smtp_login_password)
            server.send_message(message)
        return True
    except Exception as exc:
        logger.warning("Breach email failed to %s: %s", to_email, exc)
        return False
