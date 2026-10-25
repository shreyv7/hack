"""Industry-specific consent configuration packs."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

BANKING_INDUSTRY_LABEL = "Banking & Financial Services"

ATTRIBUTE_REQUIRED = "required"
ATTRIBUTE_OPTIONAL = "optional"
ATTRIBUTE_DISABLED = "disabled"


def default_banking_consent_config() -> dict[str, Any]:
    return {
        "pack": "banking",
        "enabled": True,
        "identifier_types": [
            {
                "key": "bank_customer_ref",
                "label": "Customer ID / CIF",
                "storage": "token",
                "enabled": True,
                "sensitive": True,
                "allow_offline_capture": True,
            },
            {
                "key": "account_ref",
                "label": "Account Reference",
                "storage": "token",
                "enabled": True,
                "sensitive": True,
                "allow_offline_capture": True,
            },
            {
                "key": "mobile",
                "label": "Mobile Number",
                "storage": "phone",
                "enabled": True,
                "sensitive": False,
                "allow_offline_capture": True,
            },
            {
                "key": "email",
                "label": "Email Address",
                "storage": "email",
                "enabled": True,
                "sensitive": False,
                "allow_offline_capture": True,
            },
            {
                "key": "username",
                "label": "Username",
                "storage": "token",
                "enabled": True,
                "sensitive": False,
                "allow_offline_capture": True,
            },
        ],
        "journeys": [
            {
                "key": "mobile_banking",
                "label": "Mobile Banking",
                "channel": "mobile_banking",
                "otp_required": False,
                "allow_offline_capture": False,
                "staff_metadata_required": False,
                "attributes": {
                    "bank_customer_ref": ATTRIBUTE_REQUIRED,
                    "mobile": ATTRIBUTE_REQUIRED,
                    "email": ATTRIBUTE_OPTIONAL,
                    "account_ref": ATTRIBUTE_DISABLED,
                    "username": ATTRIBUTE_DISABLED,
                },
            },
            {
                "key": "internet_banking",
                "label": "Internet Banking",
                "channel": "internet_banking",
                "otp_required": False,
                "allow_offline_capture": False,
                "staff_metadata_required": False,
                "attributes": {
                    "bank_customer_ref": ATTRIBUTE_REQUIRED,
                    "username": ATTRIBUTE_REQUIRED,
                    "email": ATTRIBUTE_OPTIONAL,
                    "mobile": ATTRIBUTE_OPTIONAL,
                    "account_ref": ATTRIBUTE_DISABLED,
                },
            },
            {
                "key": "branch_assisted",
                "label": "Branch Assisted",
                "channel": "branch",
                "otp_required": True,
                "allow_offline_capture": True,
                "staff_metadata_required": True,
                "attributes": {
                    "bank_customer_ref": ATTRIBUTE_REQUIRED,
                    "mobile": ATTRIBUTE_REQUIRED,
                    "account_ref": ATTRIBUTE_OPTIONAL,
                    "email": ATTRIBUTE_OPTIONAL,
                    "username": ATTRIBUTE_DISABLED,
                },
            },
            {
                "key": "merchant",
                "label": "Merchant Journey",
                "channel": "merchant",
                "otp_required": True,
                "allow_offline_capture": True,
                "staff_metadata_required": True,
                "attributes": {
                    "mobile": ATTRIBUTE_REQUIRED,
                    "bank_customer_ref": ATTRIBUTE_OPTIONAL,
                    "email": ATTRIBUTE_DISABLED,
                    "account_ref": ATTRIBUTE_DISABLED,
                    "username": ATTRIBUTE_DISABLED,
                },
            },
            {
                "key": "web_portal",
                "label": "Web Portal",
                "channel": "web",
                "otp_required": False,
                "allow_offline_capture": False,
                "staff_metadata_required": False,
                "attributes": {
                    "mobile": ATTRIBUTE_OPTIONAL,
                    "email": ATTRIBUTE_OPTIONAL,
                    "bank_customer_ref": ATTRIBUTE_OPTIONAL,
                    "account_ref": ATTRIBUTE_DISABLED,
                    "username": ATTRIBUTE_DISABLED,
                },
            },
        ],
        "property_journey_map": {},
    }


def default_banking_banner_presets() -> dict[str, dict[str, Any]]:
    """Suggested banner defaults per banking channel/journey (Req 3)."""
    base = {
        "display_style": "banner",
        "position": "bottom",
        "cta_accept": "Accept",
        "cta_reject": "Reject",
        "cta_customize": "Manage Preferences",
        "cta_withdraw": "Withdraw Consent",
        "show_withdraw_action": True,
    }
    return {
        "mobile_banking": {
            **base,
            "channel": "mobile_banking",
            "journey_key": "mobile_banking",
            "journey_label": "Mobile Banking",
            "display_style": "banner",
        },
        "internet_banking": {
            **base,
            "channel": "internet_banking",
            "journey_key": "internet_banking",
            "journey_label": "Internet Banking",
            "display_style": "modal",
            "position": "center",
        },
        "web_portal": {
            **base,
            "channel": "web",
            "journey_key": "web_portal",
            "journey_label": "Web Portal",
        },
        "api": {
            **base,
            "channel": "api",
            "journey_key": "api",
            "journey_label": "API",
            "display_style": "banner",
            "position": "bottom",
        },
    }


def resolve_property_journey(
    config: dict[str, Any] | None,
    property_id: str,
    journey_override: str | None = None,
) -> tuple[str | None, str | None, str | None]:
    """Return (journey_key, channel, journey_label) for a property."""
    if journey_override:
        preset = default_banking_banner_presets().get(journey_override)
        if preset:
            return (
                preset["journey_key"],
                preset["channel"],
                preset["journey_label"],
            )
        journey = get_journey_config(config or {}, journey_override)
        if journey:
            return (
                journey.get("key"),
                journey.get("channel"),
                journey.get("label"),
            )
        return journey_override, journey_override, journey_override.replace("_", " ").title()

    if not config:
        return None, None, None
    journey_map = config.get("property_journey_map") or {}
    journey_key = journey_map.get(property_id) or journey_map.get(str(property_id))
    if not journey_key:
        return None, None, None
    journey = get_journey_config(config, journey_key)
    if journey:
        return journey_key, journey.get("channel"), journey.get("label")
    preset = default_banking_banner_presets().get(journey_key)
    if preset:
        return journey_key, preset["channel"], preset["journey_label"]
    return journey_key, journey_key, journey_key.replace("_", " ").title()


def is_banking_industry(primary_industry: str | None) -> bool:
    if not primary_industry:
        return False
    return primary_industry.strip().lower() == BANKING_INDUSTRY_LABEL.lower()


def banking_pack_enabled(consent_industry_config: dict[str, Any] | None) -> bool:
    if not consent_industry_config:
        return False
    return bool(consent_industry_config.get("enabled")) and consent_industry_config.get("pack") == "banking"


def ensure_banking_config(
    primary_industry: str | None,
    consent_industry_config: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not is_banking_industry(primary_industry):
        return consent_industry_config
    if consent_industry_config and banking_pack_enabled(consent_industry_config):
        return consent_industry_config
    return default_banking_consent_config()


def merge_banking_config_update(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
) -> dict[str, Any]:
    base = deepcopy(current) if current else default_banking_consent_config()
    for key, value in patch.items():
        if value is not None:
            base[key] = value
    base["pack"] = "banking"
    base["enabled"] = bool(base.get("enabled", True))
    return base


def get_journey_config(config: dict[str, Any], journey_key: str) -> dict[str, Any] | None:
    for j in config.get("journeys", []):
        if j.get("key") == journey_key:
            return j
    return None


def journey_requires_otp(config: dict[str, Any], journey_key: str) -> bool:
    journey = get_journey_config(config, journey_key)
    return bool(journey.get("otp_required", False)) if journey else False


def default_dpdpa_evidentiary_profile() -> dict[str, Any]:
    """Minimum evidentiary fields preserved under DPDPA while reducing PII exposure."""
    return {
        "dpdpa_minimum_record": True,
        "keep_fields": [
            "consent_reference",
            "proof_hash",
            "transaction_id",
            "customer_ref_token",
            "created_at",
            "record_type",
        ],
        "min_retention_days": 365,
        "legal_basis_note": "DPDPA 2023 Sec 8(7) — retain minimum records for compliance; strip operational PII.",
    }


def default_banking_retention_presets() -> list[dict[str, Any]]:
    """Suggested retention policy templates for RBI-regulated banks (admin applies manually)."""
    profile = default_dpdpa_evidentiary_profile()
    return [
        {
            "name": "KYC records — RBI retention",
            "data_category": "kyc",
            "period_value": 7,
            "period_unit": "years",
            "trigger_event": "contract_end",
            "legal_basis": "RBI KYC Master Direction",
            "action": "archive",
            "evidentiary_profile": profile,
            "notes": "Archive after relationship end; do not delete until statutory period expires.",
        },
        {
            "name": "Transaction logs — operational",
            "data_category": "transaction",
            "period_value": 10,
            "period_unit": "years",
            "trigger_event": "creation_date",
            "legal_basis": "RBI / taxation",
            "action": "mask",
            "evidentiary_profile": profile,
            "notes": "Mask PII in logs; preserve audit trail fields.",
        },
        {
            "name": "Marketing consent — post withdrawal",
            "data_category": "marketing",
            "period_value": 0,
            "period_unit": "days",
            "trigger_event": "consent_withdrawal",
            "legal_basis": "DPDPA consent",
            "action": "pseudonymize",
            "evidentiary_profile": profile,
            "notes": "Pseudonymize on consent withdrawal; proof vault retains evidentiary minimum.",
        },
        {
            "name": "Dormant customer data",
            "data_category": "customer_profile",
            "period_value": 3,
            "period_unit": "years",
            "trigger_event": "last_interaction",
            "legal_basis": "DPDPA storage limitation",
            "action": "anonymize",
            "evidentiary_profile": profile,
        },
    ]


def default_ropa_banking_presets() -> dict[str, dict[str, Any]]:
    """Suggested RoPA banking_context presets per journey (Req 8)."""
    return {
        "kyc_onboarding": {
            "label": "KYC / Account Onboarding",
            "channels": ["mobile_banking", "internet_banking"],
            "identifier_types": ["bank_customer_ref", "mobile", "account_ref"],
            "primary_identifier": "bank_customer_ref",
            "secondary_identifiers": ["mobile"],
            "consent_journey_keys": ["mobile_banking", "internet_banking"],
        },
        "branch_assisted": {
            "label": "Branch Assisted Processing",
            "channels": ["branch"],
            "identifier_types": ["bank_customer_ref", "mobile", "account_ref"],
            "primary_identifier": "bank_customer_ref",
            "secondary_identifiers": ["mobile", "account_ref"],
            "consent_journey_keys": ["branch_assisted"],
        },
        "merchant_payments": {
            "label": "Merchant / Payment Processing",
            "channels": ["merchant"],
            "identifier_types": ["mobile", "bank_customer_ref"],
            "primary_identifier": "mobile",
            "secondary_identifiers": ["bank_customer_ref"],
            "consent_journey_keys": ["merchant"],
        },
        "web_portal": {
            "label": "Web Portal / Marketing",
            "channels": ["web"],
            "identifier_types": ["mobile", "email", "bank_customer_ref"],
            "primary_identifier": "mobile",
            "secondary_identifiers": ["email"],
            "consent_journey_keys": ["web_portal"],
        },
    }


def validate_ropa_banking_context(
    banking_context: dict[str, Any],
    config: dict[str, Any] | None = None,
) -> None:
    """Raise ValueError when banking_context keys are unknown for the org banking pack."""
    from fastapi import HTTPException, status

    cfg = config or default_banking_consent_config()
    valid_identifiers = {it["key"] for it in cfg.get("identifier_types", []) if it.get("enabled", True)}
    valid_journey_keys = {j["key"] for j in cfg.get("journeys", [])}
    valid_channels = {j.get("channel") for j in cfg.get("journeys", []) if j.get("channel")}

    channels = banking_context.get("channels") or []
    for ch in channels:
        if ch not in valid_channels:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown banking channel: {ch}",
            )

    identifier_types = banking_context.get("identifier_types") or []
    for ident in identifier_types:
        if ident not in valid_identifiers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown identifier type: {ident}",
            )

    primary = banking_context.get("primary_identifier")
    if primary and primary not in valid_identifiers:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown primary identifier: {primary}",
        )
    if primary and identifier_types and primary not in identifier_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="primary_identifier must be included in identifier_types",
        )

    for secondary in banking_context.get("secondary_identifiers") or []:
        if secondary not in valid_identifiers:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown secondary identifier: {secondary}",
            )

    for journey_key in banking_context.get("consent_journey_keys") or []:
        if journey_key not in valid_journey_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown consent journey key: {journey_key}",
            )

