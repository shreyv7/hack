"""OTP and DSAR notification emails."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_email(
    *,
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str | None = None,
    attachment: tuple[str, bytes, str] | None = None,
) -> bool:
    if not settings.smtp_ready:
        logger.warning("SMTP not configured — email to %s: %s", to_email, subject)
        if settings.ENVIRONMENT == "development":
            import os
            from datetime import datetime, timezone
            log_dir = "/Users/shreyvashistha/Desktop/ZEROSHIELD-DPDPA/dpdpa_shield/backend/scratch"
            os.makedirs(log_dir, exist_ok=True)
            log_path = os.path.join(log_dir, "sent_emails.log")
            with open(log_path, "a") as f:
                f.write(f"\n==================================================\n")
                f.write(f"TIME: {datetime.now(timezone.utc)}\n")
                f.write(f"TO: {to_email}\n")
                f.write(f"SUBJECT: {subject}\n")
                f.write(f"BODY:\n{text_body}\n")
                if html_body:
                    f.write(f"HTML BODY:\n{html_body}\n")
                f.write(f"==================================================\n")
            logger.info("DEVELOPMENT: Simulated email written to scratch/sent_emails.log")
            return True
        return False
    try:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        message["To"] = to_email
        message.set_content(text_body)
        if html_body:
            message.add_alternative(html_body, subtype="html")
        if attachment:
            filename, payload, mime = attachment
            maintype, _, subtype = mime.partition("/")
            message.add_attachment(payload, maintype=maintype, subtype=subtype, filename=filename)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.smtp_login_password)
            server.send_message(message)
        logger.info("Email sent to %s: %s", to_email, subject)
        return True
    except Exception as exc:
        logger.warning("Email failed for %s (%s): %s", to_email, subject, exc)
        return False


def send_otp_email(to_email: str, otp_code: str) -> bool:
    subject = "Your DPDPA Shield verification code"
    text_body = (
        f"Your DPDPA Shield verification code is: {otp_code}\n\n"
        "This code expires in 15 minutes. Do not share it with anyone."
    )
    html_body = (
        f"<p>Your verification code is <strong>{otp_code}</strong>.</p>"
        "<p>This code expires in 15 minutes. Do not share it with anyone.</p>"
    )
    if not settings.smtp_ready:
        logger.warning("SMTP not configured — OTP for %s: %s", to_email, otp_code)
        return False
    return _send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)


def send_request_accepted_email(to_email: str, tracking_id: str, right_type_label: str) -> bool:
    subject = f"Your data rights request has been accepted — {tracking_id}"
    text_body = (
        f"Your identity has been verified and your request has been accepted.\n\n"
        f"Request ID: {tracking_id}\n"
        f"Right exercised: {right_type_label}\n\n"
        "We will process your request in accordance with the Digital Personal Data Protection Act, 2023. "
        "You can check the status of your request at any time using your Request ID."
    )
    html_body = (
        "<p>Your identity has been verified and your request has been accepted.</p>"
        f"<p><strong>Request ID:</strong> <code>{tracking_id}</code></p>"
        f"<p><strong>Right exercised:</strong> {right_type_label}</p>"
        "<p>We will process your request in accordance with the Digital Personal Data Protection Act, 2023.</p>"
    )
    return _send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)


def send_status_update_email(
    to_email: str,
    tracking_id: str,
    right_type_label: str,
    status_message: str,
) -> bool:
    subject = f"Update on your data rights request — {tracking_id}"
    text_body = (
        f"Request ID: {tracking_id}\n"
        f"Right exercised: {right_type_label}\n\n"
        f"{status_message}"
    )
    html_body = (
        f"<p><strong>Request ID:</strong> <code>{tracking_id}</code></p>"
        f"<p><strong>Right exercised:</strong> {right_type_label}</p>"
        f"<p>{status_message}</p>"
    )
    return _send_email(to_email=to_email, subject=subject, text_body=text_body, html_body=html_body)


def send_closure_email(
    to_email: str,
    tracking_id: str,
    closure_text: str,
    pdf_bytes: bytes,
) -> bool:
    subject = f"Your data rights request has been closed — {tracking_id}"
    text_body = (
        f"Your data rights request {tracking_id} has been completed and closed.\n\n"
        "Please find the closure letter attached as a PDF.\n\n"
        f"{closure_text}"
    )
    return _send_email(
        to_email=to_email,
        subject=subject,
        text_body=text_body,
        attachment=(f"dsar-closure-{tracking_id}.pdf", pdf_bytes, "application/pdf"),
    )


def send_sla_reminder_email(
    to_email: str,
    tracking_id: str,
    right_type: str,
    days_remaining: int,
    *,
    reminder_type: str = "due",
) -> bool:
    if reminder_type.startswith("ack"):
        subject = f"Grievance ack overdue — {tracking_id}"
        text_body = (
            f"Grievance request {tracking_id} requires acknowledgement under DPDPA Section 13.\n"
            "Please acknowledge in the DSAR SLA Tracker immediately."
        )
    elif reminder_type == "overdue":
        subject = f"DSAR SLA breached — {tracking_id}"
        text_body = (
            f"Data rights request {tracking_id} ({right_type}) has breached its response deadline.\n"
            "Please review in the DSAR SLA Tracker."
        )
    else:
        subject = f"DSAR reminder — {tracking_id} due in {days_remaining} day(s)"
        text_body = (
            f"Data rights request {tracking_id} ({right_type}) is due in {days_remaining} day(s).\n"
            "Please review in the DSAR SLA Tracker."
        )
    return _send_email(to_email=to_email, subject=subject, text_body=text_body)
