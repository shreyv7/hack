"""Validate notice delivery provider credential completeness."""

from __future__ import annotations


def _has_values(credentials: dict[str, str], *keys: str) -> bool:
    return all(str(credentials.get(key, "")).strip() for key in keys)


def is_provider_configured(channel: str, provider_name: str, credentials: dict[str, str]) -> bool:
    """Return True when an active provider row has the credentials its adapter needs."""
    if not credentials:
        return False

    name = provider_name.strip().lower()

    if channel == "email":
        if "firebase" in name:
            return _has_values(credentials, "firebase_project_id", "firebase_api_key")
        if "ses" in name or "amazon" in name:
            return _has_values(
                credentials,
                "aws_access_key_id",
                "aws_secret_access_key",
                "sender_email",
            )
        # SMTP and generic email relays
        if not _has_values(credentials, "smtp_host", "sender_email"):
            return False
        smtp_user = str(credentials.get("smtp_user", "")).strip()
        smtp_password = str(credentials.get("smtp_password", "")).strip()
        if smtp_user or smtp_password:
            return bool(smtp_user and smtp_password)
        return True

    if channel == "sms":
        if "msg91" in name:
            return _has_values(credentials, "msg91_authkey")
        if "twilio" in name:
            return _has_values(
                credentials,
                "twilio_account_sid",
                "twilio_auth_token",
                "twilio_from_number",
            )
        return _has_values(credentials, "msg91_authkey") or _has_values(
            credentials,
            "twilio_account_sid",
            "twilio_auth_token",
            "twilio_from_number",
        )

    if channel == "whatsapp":
        return _has_values(credentials, "whatsapp_access_token", "whatsapp_phone_number_id")

    if channel == "physical":
        return _has_values(credentials, "shiprocket_email", "shiprocket_password")

    if channel == "in-app":
        return True

    return False


def configured_provider_for_channel(
    providers: list,
    channel: str,
):
    """Return the active, fully configured provider for a channel, if any."""
    for provider in providers:
        if provider.channel != channel or not provider.is_active:
            continue
        creds = provider.config if hasattr(provider, "config") else {}
        if is_provider_configured(channel, provider.provider_name, creds):
            return provider
    return None
