"""Serialize notice delivery providers for API responses."""

from __future__ import annotations

from app.models.notice_delivery import NoticeDeliveryProvider
from app.models.organization_settings import OrganizationSettings
from app.schemas.notice_delivery import DpNotificationAutoConfig, NoticeDeliveryProviderRead
from app.services.notice_provider_validation import (
    configured_provider_for_channel,
    is_provider_configured,
)

BREACH_DP_CHANNELS = ("email", "sms", "physical", "in-app")


def provider_to_read(provider: NoticeDeliveryProvider) -> NoticeDeliveryProviderRead:
    creds = provider.config
    return NoticeDeliveryProviderRead(
        id=provider.id,
        organization_id=provider.organization_id,
        channel=provider.channel,
        provider_name=provider.provider_name,
        is_active=provider.is_active,
        is_configured=is_provider_configured(provider.channel, provider.provider_name, creds),
        config=creds,
        created_at=provider.created_at,
        updated_at=provider.updated_at,
    )


def build_dp_notification_auto_config(
    providers: list[NoticeDeliveryProvider],
    org_settings: OrganizationSettings | None,
) -> DpNotificationAutoConfig:
    configured_channels: list[str] = ["in-app"]
    providers_by_channel: dict[str, str] = {}

    for channel in ("email", "sms", "physical"):
        provider = configured_provider_for_channel(providers, channel)
        if provider is not None:
            configured_channels.append(channel)
            providers_by_channel[channel] = provider.provider_name

    external_ready = [channel for channel in configured_channels if channel != "in-app"]
    default_dp_channels = external_ready if external_ready else ["in-app"]

    return DpNotificationAutoConfig(
        configured_channels=configured_channels,
        providers_by_channel=providers_by_channel,
        default_dp_channels=default_dp_channels,
        default_contact_email=(org_settings.dpo_email if org_settings else None),
        dispatch_ready=bool(external_ready),
    )
