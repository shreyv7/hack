"""
Send a test email to verify SMTP settings in backend/.env.

Usage (from backend/ with venv active):
    python -m app.scripts.test_smtp --to you@gmail.com
"""

from __future__ import annotations

import argparse
import sys

from app.core.config import settings
from app.services.email_service import ConfigurationError, EmailService


def main() -> int:
    parser = argparse.ArgumentParser(description="Send a test SMTP message using .env settings")
    parser.add_argument(
        "--to",
        required=True,
        help="Recipient email address",
    )
    args = parser.parse_args()

    if not settings.smtp_ready:
        print(
            "SMTP is not ready. Edit backend/.env:\n"
            "  1. Set SMTP_USER to your Gmail address\n"
            "  2. Set SMTP_PASSWORD to a Gmail App Password (16 chars, no spaces)\n"
            "     Create at: https://myaccount.google.com/apppasswords\n"
            "  3. Enable 2-Step Verification on the Google account first\n",
            file=sys.stderr,
        )
        return 1

    try:
        EmailService().send_invite(
            args.to,
            "SMTP Test",
            "test-password-not-used-for-login",
        )
    except ConfigurationError as exc:
        print(f"Configuration error: {exc}", file=sys.stderr)
        return 1
    except Exception as exc:
        print(f"Failed to send: {exc}", file=sys.stderr)
        return 1

    print(f"Test invite email sent to {args.to} via {settings.SMTP_USER}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
