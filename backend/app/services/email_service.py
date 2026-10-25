"""
SMTP email delivery for invites and signup-approval notices.
"""

from email.message import EmailMessage
import logging
import smtplib

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.email_templates import render_invite_email, render_signup_approved_email

logger = logging.getLogger(__name__)


class ConfigurationError(RuntimeError):
    """Raised when required SMTP environment variables are missing."""


def validate_smtp_config() -> None:
    """Ensure all SMTP_* settings are present. Call before sending mail."""
    try:
        settings.validate_smtp_for_startup()
    except RuntimeError as exc:
        raise ConfigurationError(str(exc)) from exc


class EmailService:
    def __init__(self) -> None:
        validate_smtp_config()

    def _send(self, to_email: str, subject: str, text_body: str, html_body: str) -> None:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        message["To"] = to_email
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.smtp_login_password)
            server.send_message(message)

    def send_invite(self, to_email: str, full_name: str, temp_password: str) -> None:
        content = render_invite_email(
            to_email=to_email,
            full_name=full_name,
            temp_password=temp_password,
        )
        self._send(to_email, content.subject, content.text_body, content.html_body)

    def send_signup_approved(self, to_email: str, full_name: str) -> None:
        content = render_signup_approved_email(to_email=to_email, full_name=full_name)
        self._send(to_email, content.subject, content.text_body, content.html_body)


def send_invite_safe(to_email: str, full_name: str, temp_password: str) -> bool:
    """
    Send an invite email. Returns True if sent.

    In development, logs SMTP failures instead of raising so org/user creation
    still succeeds when Gmail is not configured.
    """
    if not settings.smtp_ready:
        logger.warning(
            "SMTP not configured (set SMTP_USER + Gmail App Password in backend/.env). "
            "Invite for %s — temporary password: %s",
            to_email,
            temp_password,
        )
        return False

    try:
        EmailService().send_invite(to_email, full_name, temp_password)
        logger.info("Invite email sent to %s", to_email)
        return True
    except Exception as exc:
        if settings.ENVIRONMENT == "production":
            raise HTTPException(
                status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Account was created but the invite email could not be sent. Check SMTP settings.",
            ) from exc
        logger.warning(
            "Invite email not sent to %s: %s — temporary password: %s",
            to_email,
            exc,
            temp_password,
        )
        return False


def send_signup_approved_safe(to_email: str, full_name: str) -> bool:
    """Send the post-approval login email. Never blocks approval on SMTP failure."""
    if not settings.smtp_ready:
        logger.warning(
            "SMTP not configured. Signup approved for %s but no email was sent.",
            to_email,
        )
        return False

    try:
        EmailService().send_signup_approved(to_email, full_name)
        logger.info("Signup-approved email sent to %s", to_email)
        return True
    except Exception as exc:
        logger.warning("Signup-approved email not sent to %s: %s", to_email, exc)
        return False
