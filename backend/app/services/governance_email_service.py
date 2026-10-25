"""Email delivery for scheduled governance dashboard reports."""

from __future__ import annotations

import logging

from app.services.dsar_email import _send_email

logger = logging.getLogger(__name__)


def send_scheduled_dashboard_report(
    *,
    recipients: list[str],
    dashboard_name: str,
    schedule_name: str,
    attachment_filename: str,
    attachment_bytes: bytes,
    content_type: str,
) -> int:
    """Send export to each recipient. Returns count of successful sends."""
    subject = f"Scheduled report: {schedule_name} — {dashboard_name}"
    text_body = (
        f"Your scheduled governance dashboard report is attached.\n\n"
        f"Dashboard: {dashboard_name}\n"
        f"Schedule: {schedule_name}\n"
    )
    sent = 0
    for email in recipients:
        if not email or "@" not in email:
            continue
        ok = _send_email(
            to_email=email.strip(),
            subject=subject,
            text_body=text_body,
            attachment=(attachment_filename, attachment_bytes, content_type),
        )
        if ok:
            sent += 1
    return sent
