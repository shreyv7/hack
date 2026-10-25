"""Parental-consent request email (DPDPA Section 9 verifiable consent).

White-labeled: the email is presented as coming from the organisation (their
name as the sender display + their logo), so the parent deals with a brand they
recognise, not "Vajra".
"""

from __future__ import annotations

import html
import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: str,
    from_name: str | None = None,
) -> bool:
    if not settings.smtp_ready:
        logger.warning("SMTP not configured — consent email to %s not sent: %s", to_email, subject)
        return False
    try:
        message = EmailMessage()
        message["Subject"] = subject
        # Display the organisation as the sender (address stays the platform SMTP).
        message["From"] = f"{from_name or settings.SMTP_FROM_NAME} <{settings.SMTP_USER}>"
        message["To"] = to_email
        message.set_content(text_body)
        message.add_alternative(html_body, subtype="html")
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.smtp_login_password)
            server.send_message(message)
        logger.info("Parental consent email sent to %s", to_email)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Consent email failed for %s: %s", to_email, exc)
        return False


def send_consent_request_email(
    to_email: str,
    *,
    parent_name: str | None,
    org_name: str,
    link: str,
    purpose_note: str | None,
    link_expiry_days: int,
    logo_url: str | None = None,
    support_email: str | None = None,
) -> bool:
    greeting = f"Dear {parent_name}," if parent_name else "Dear Parent / Guardian,"
    purpose_line = f"\nPurpose: {purpose_note}\n" if purpose_note else ""
    contact_line = f"\nQuestions? Contact {support_email}.\n" if support_email else ""
    subject = f"Action needed: parental consent for your child's data — {org_name}"
    text_body = (
        f"{greeting}\n\n"
        f"{org_name} processes personal data belonging to a child in your care. "
        "Under India's Digital Personal Data Protection Act, 2023, this requires your "
        "verifiable consent as a parent or guardian.\n"
        f"{purpose_line}\n"
        "Please review and respond using the secure link below:\n"
        f"{link}\n\n"
        f"This link expires in {link_expiry_days} day(s). If you did not expect this, "
        "you can ignore this email or decline on the page.\n"
        f"{contact_line}\n"
        f"— {org_name}"
    )

    safe_org = html.escape(org_name)
    header = (
        f'<img src="{html.escape(logo_url)}" alt="{safe_org}" style="max-height:48px;margin-bottom:8px">'
        if logo_url
        else f'<div style="font-size:20px;font-weight:700;color:#111827">{safe_org}</div>'
    )
    html_body = f"""\
<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:560px;margin:auto;color:#1f2937">
  <div style="border-bottom:1px solid #e5e7eb;padding-bottom:12px;margin-bottom:16px">{header}</div>
  <p>{html.escape(greeting)}</p>
  <p><strong>{safe_org}</strong> processes personal data belonging to a child in your care.
  Under India's Digital Personal Data Protection Act, 2023, this requires your
  <strong>verifiable consent</strong> as a parent or guardian.</p>
  {f'<p><strong>Purpose:</strong> {html.escape(purpose_note)}</p>' if purpose_note else ''}
  <p style="text-align:center;margin:28px 0">
    <a href="{html.escape(link)}" style="background:#4f46e5;color:#fff;padding:12px 22px;border-radius:8px;
       text-decoration:none;font-weight:600">Review &amp; respond</a>
  </p>
  <p style="color:#6b7280;font-size:13px">This link expires in {link_expiry_days} day(s).
  If you did not expect this, you can ignore this email or decline on the page.</p>
  {f'<p style="color:#6b7280;font-size:13px">Questions? Contact <a href="mailto:{html.escape(support_email)}">{html.escape(support_email)}</a>.</p>' if support_email else ''}
  <p style="color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;padding-top:12px">
    Sent by {safe_org} to obtain verifiable parental consent under the DPDPA, 2023.</p>
</div>"""
    return _send(to_email, subject, text_body, html_body, from_name=org_name)


def send_bulk_consent_request_emails(
    payloads: list[dict],
    *,
    org_name: str,
    logo_url: str | None,
    support_email: str | None,
    purpose_note: str | None,
    link_expiry_days: int,
) -> None:
    """Send a batch of consent-request emails (one per parent). Runs off the
    request path (FastAPI background task); failures are logged, not raised —
    the records stay 'pending' so an admin can resend individually."""
    sent = failed = 0
    for item in payloads:
        ok = send_consent_request_email(
            item["to_email"],
            parent_name=item.get("parent_name"),
            org_name=org_name,
            logo_url=logo_url,
            support_email=support_email,
            link=item["link"],
            purpose_note=purpose_note,
            link_expiry_days=link_expiry_days,
        )
        if ok:
            sent += 1
        else:
            failed += 1
    logger.info("Bulk parental-consent emails: %s sent, %s failed", sent, failed)
