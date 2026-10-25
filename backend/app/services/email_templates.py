"""
Render invite email bodies from HTML/text templates.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from pathlib import Path

from app.core.config import settings

_TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates" / "email"


@dataclass(frozen=True)
class EmailContent:
    subject: str
    text_body: str
    html_body: str


InviteEmailContent = EmailContent


def _load_template(name: str) -> str:
    path = _TEMPLATES_DIR / name
    if not path.is_file():
        raise FileNotFoundError(f"Email template not found: {path}")
    return path.read_text(encoding="utf-8")


def _substitute(template: str, values: dict[str, str]) -> str:
    result = template
    for key, value in values.items():
        result = result.replace(f"{{{{ {key} }}}}", value)
        result = result.replace(f"{{{{{key}}}}}", value)
    return result


def render_invite_email(
    *,
    to_email: str,
    full_name: str,
    temp_password: str,
) -> InviteEmailContent:
    """Build subject and multipart bodies for a user invite."""
    product_name = settings.SMTP_FROM_NAME
    login_url = settings.FRONTEND_URL.rstrip("/")
    year = str(datetime.now(timezone.utc).year)

    values = {
        "product_name": escape(product_name),
        "full_name": escape(full_name.strip()),
        "email": escape(to_email.strip()),
        "temp_password": escape(temp_password),
        "login_url": escape(login_url),
        "year": year,
    }

    text_values = {
        **values,
        "product_name": product_name,
        "full_name": full_name.strip(),
        "email": to_email.strip(),
        "temp_password": temp_password,
        "login_url": login_url,
    }

    subject = f"{product_name} — Your account is ready"
    text_body = _substitute(_load_template("invite.txt"), text_values)
    html_body = _substitute(_load_template("invite.html"), values)

    return InviteEmailContent(subject=subject, text_body=text_body, html_body=html_body)


def render_signup_approved_email(*, to_email: str, full_name: str) -> EmailContent:
    """Build the email sent after a superadmin approves a self-service signup."""
    product_name = settings.SMTP_FROM_NAME
    login_url = settings.FRONTEND_URL.rstrip("/")
    year = str(datetime.now(timezone.utc).year)

    values = {
        "product_name": escape(product_name),
        "full_name": escape(full_name.strip() or to_email.strip()),
        "email": escape(to_email.strip()),
        "login_url": escape(login_url),
        "year": year,
    }
    text_values = {
        **values,
        "product_name": product_name,
        "full_name": full_name.strip() or to_email.strip(),
        "email": to_email.strip(),
        "login_url": login_url,
    }
    return EmailContent(
        subject=f"{product_name} — Your workspace is approved",
        text_body=_substitute(_load_template("signup_approved.txt"), text_values),
        html_body=_substitute(_load_template("signup_approved.html"), values),
    )
