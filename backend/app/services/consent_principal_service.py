"""Validate banking consent identifiers and link cross-channel principals."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.consent_principal import ConsentPrincipal, ConsentPrincipalIdentifier, LinkageSource
from app.models.organization_settings import OrganizationSettings
from app.schemas.consent_banking import ConsentIdentifierInput
from app.utils.india_phone import normalize_india_phone
from app.utils.industry_packs import (
    ATTRIBUTE_DISABLED,
    ATTRIBUTE_OPTIONAL,
    ATTRIBUTE_REQUIRED,
    banking_pack_enabled,
    default_banking_consent_config,
)

_RAW_DIGIT_TOKEN = re.compile(r"^\d{10,18}$")


@dataclass
class BankingCaptureContext:
    principal_id: UUID | None = None
    journey_key: str | None = None
    capture_channel: str | None = None
    bank_customer_ref: str | None = None
    identifier_snapshot: list[dict[str, str]] = field(default_factory=list)
    identifier_types_used: list[str] = field(default_factory=list)
    principal_email: str | None = None
    principal_phone: str | None = None
    notice_version_id: UUID | None = None


class ConsentPrincipalService:
    def __init__(self, db: Session):
        self.db = db

    @staticmethod
    def fingerprint(org_id: UUID, identifier_type: str, token: str) -> str:
        raw = f"{org_id}:{identifier_type}:{token}".encode()
        return hashlib.sha256(raw).hexdigest()

    def get_config(self, settings: OrganizationSettings | None) -> dict[str, Any] | None:
        if settings is None:
            return None
        cfg = settings.consent_industry_config
        if cfg and banking_pack_enabled(cfg):
            return cfg
        return None

    def _type_map(self, config: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {t["key"]: t for t in config.get("identifier_types", []) if t.get("enabled", True)}

    def _journey_map(self, config: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {j["key"]: j for j in config.get("journeys", [])}

    def _normalize_token(self, storage: str, token: str) -> str:
        if storage == "phone":
            return normalize_india_phone(token)
        if storage == "email":
            try:
                return validate_email(token, check_deliverability=False).normalized
            except EmailNotValidError as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid email address") from exc
        cleaned = token.strip()
        if not cleaned:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Identifier token cannot be empty")
        return cleaned

    def _guard_sensitive_token(self, type_cfg: dict[str, Any], token: str) -> None:
        if type_cfg.get("storage") != "token":
            return
        if not type_cfg.get("sensitive"):
            return
        if _RAW_DIGIT_TOKEN.match(token.replace(" ", "").replace("-", "")):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Sensitive identifier '{type_cfg['key']}' must be a bank-issued opaque token, "
                    "not a raw numeric value (DPDPA data minimization)."
                ),
            )

    def _collect_values(
        self,
        config: dict[str, Any],
        journey_key: str | None,
        capture_channel: str | None,
        bank_customer_ref: str | None,
        identifiers: list[ConsentIdentifierInput],
        principal_email: str | None,
        principal_phone: str | None,
        capture_mode: str = "online",
    ) -> tuple[dict[str, str], dict[str, Any]]:
        type_map = self._type_map(config)
        journeys = self._journey_map(config)
        journey = journeys.get(journey_key or "")
        if not journey and journey_key:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unknown journey '{journey_key}'")

        resolved: dict[str, str] = {}
        if bank_customer_ref and bank_customer_ref.strip():
            resolved["bank_customer_ref"] = bank_customer_ref.strip()
        if principal_email and principal_email.strip():
            resolved.setdefault("email", principal_email.strip())
        if principal_phone and principal_phone.strip():
            resolved.setdefault("mobile", principal_phone.strip())
        for item in identifiers:
            resolved[item.type] = item.token

        if not journey:
            # Non-journey capture: only accept enabled types present in payload
            normalized: dict[str, str] = {}
            for key, raw in resolved.items():
                type_cfg = type_map.get(key)
                if not type_cfg:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"Identifier type '{key}' is not enabled for this organization",
                    )
                if capture_mode == "offline" and not type_cfg.get("allow_offline_capture", True):
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"Identifier '{key}' cannot be captured offline (DPDPA policy)",
                    )
                token = self._normalize_token(type_cfg.get("storage", "token"), raw)
                self._guard_sensitive_token(type_cfg, token)
                normalized[key] = token
            return normalized, journey or {}

        journey_attrs: dict[str, str] = journey.get("attributes", {})
        normalized = {}
        for key, level in journey_attrs.items():
            if level == ATTRIBUTE_DISABLED:
                if key in resolved:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail=f"Identifier '{key}' is disabled for journey '{journey_key}' (DPDPA minimization)",
                    )
                continue
            type_cfg = type_map.get(key)
            if not type_cfg:
                continue
            if capture_mode == "offline" and not type_cfg.get("allow_offline_capture", True):
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Identifier '{key}' cannot be captured offline for journey '{journey_key}'",
                )
            raw = resolved.get(key)
            if level == ATTRIBUTE_REQUIRED and not raw:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Required identifier '{key}' missing for journey '{journey_key}'",
                )
            if not raw:
                continue
            token = self._normalize_token(type_cfg.get("storage", "token"), raw)
            self._guard_sensitive_token(type_cfg, token)
            normalized[key] = token

        for key in resolved:
            if key not in journey_attrs and key not in type_map:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown identifier type '{key}'",
                )
        return normalized, journey

    def normalize_raw_identifiers(
        self,
        *,
        principal_email: str | None = None,
        principal_phone: str | None = None,
    ) -> dict[str, str]:
        """Normalize email/phone for any org (not banking-pack-specific)."""
        normalized: dict[str, str] = {}
        if principal_email and principal_email.strip():
            normalized["email"] = self._normalize_token("email", principal_email.strip())
        if principal_phone and principal_phone.strip():
            normalized["mobile"] = self._normalize_token("phone", principal_phone.strip())
        return normalized

    def link_principal_from_raw(
        self,
        org_id: UUID,
        *,
        principal_email: str | None = None,
        principal_phone: str | None = None,
        channel: str = "web",
    ) -> tuple[UUID | None, dict[str, str], list[dict[str, str]]]:
        """Link or create a consent principal from raw email/phone (all industries)."""
        normalized = self.normalize_raw_identifiers(
            principal_email=principal_email,
            principal_phone=principal_phone,
        )
        if not normalized:
            return None, {}, []

        principal_id = self._link_principal(org_id, normalized, channel)
        snapshot = [
            {"type": id_type, "fingerprint": self.fingerprint(org_id, id_type, token)}
            for id_type, token in normalized.items()
        ]
        return principal_id, normalized, snapshot

    def prepare_banking_context(
        self,
        *,
        org_id: UUID,
        settings: OrganizationSettings | None,
        journey_key: str | None,
        capture_channel: str | None,
        bank_customer_ref: str | None,
        identifiers: list[ConsentIdentifierInput],
        principal_email: str | None,
        principal_phone: str | None,
        notice_version_id: UUID | None,
        require_live_notice: bool = True,
        capture_mode: str = "online",
    ) -> BankingCaptureContext | None:
        config = self.get_config(settings)
        if not config:
            return None

        if require_live_notice and settings and settings.primary_industry:
            pass  # notice check done by caller when property has notice

        normalized, journey = self._collect_values(
            config,
            journey_key,
            capture_channel,
            bank_customer_ref,
            identifiers,
            principal_email,
            principal_phone,
            capture_mode=capture_mode,
        )

        channel = capture_channel or journey.get("channel") or "web"
        jkey = journey_key or journey.get("key")

        snapshot = [
            {
                "type": k,
                "fingerprint": self.fingerprint(org_id, k, v),
            }
            for k, v in normalized.items()
        ]

        principal_id = self._link_principal(org_id, normalized, channel)

        ctx = BankingCaptureContext(
            principal_id=principal_id,
            journey_key=jkey,
            capture_channel=channel,
            bank_customer_ref=normalized.get("bank_customer_ref"),
            identifier_snapshot=snapshot,
            identifier_types_used=list(normalized.keys()),
            principal_email=normalized.get("email"),
            principal_phone=normalized.get("mobile"),
            notice_version_id=notice_version_id,
        )
        return ctx

    def _link_principal(
        self,
        org_id: UUID,
        normalized: dict[str, str],
        channel: str,
    ) -> UUID | None:
        if not normalized:
            return None

        now = datetime.now(timezone.utc)
        bank_ref = normalized.get("bank_customer_ref")

        principal: ConsentPrincipal | None = None
        if bank_ref:
            principal = (
                self.db.query(ConsentPrincipal)
                .filter(
                    ConsentPrincipal.organization_id == org_id,
                    ConsentPrincipal.canonical_ref == bank_ref,
                )
                .first()
            )
            if principal is None:
                principal = ConsentPrincipal(
                    organization_id=org_id,
                    canonical_ref=bank_ref,
                    linkage_source=LinkageSource.bank_provided,
                )
                self.db.add(principal)
                self.db.flush()

        if principal is None:
            for id_type, token in normalized.items():
                fp = self.fingerprint(org_id, id_type, token)
                match = (
                    self.db.query(ConsentPrincipalIdentifier)
                    .join(ConsentPrincipal)
                    .filter(
                        ConsentPrincipal.organization_id == org_id,
                        ConsentPrincipalIdentifier.identifier_type == id_type,
                        ConsentPrincipalIdentifier.token_fingerprint == fp,
                    )
                    .first()
                )
                if match:
                    principal = match.principal
                    break

        if principal is None:
            canonical = bank_ref or f"derived:{uuid4().hex[:16]}"
            principal = ConsentPrincipal(
                organization_id=org_id,
                canonical_ref=canonical,
                linkage_source=LinkageSource.bank_provided if bank_ref else LinkageSource.platform_derived,
            )
            self.db.add(principal)
            self.db.flush()

        for id_type, token in normalized.items():
            fp = self.fingerprint(org_id, id_type, token)
            existing = (
                self.db.query(ConsentPrincipalIdentifier)
                .filter(
                    ConsentPrincipalIdentifier.principal_id == principal.id,
                    ConsentPrincipalIdentifier.identifier_type == id_type,
                    ConsentPrincipalIdentifier.token_fingerprint == fp,
                )
                .first()
            )
            if existing is None:
                self.db.add(
                    ConsentPrincipalIdentifier(
                        principal_id=principal.id,
                        identifier_type=id_type,
                        identifier_token=token,
                        token_fingerprint=fp,
                        last_seen_channel=channel,
                        last_seen_at=now,
                    )
                )
            else:
                existing.last_seen_channel = channel
                existing.last_seen_at = now

        return principal.id

    def find_principal_for_dsar(self, org_id: UUID, normalized: dict[str, str]):
        """Locate consent principal by banking identifiers (DSAR portal — no new principal created)."""
        if not normalized:
            return None

        bank_ref = normalized.get("bank_customer_ref")
        if bank_ref:
            from app.models.consent_principal import ConsentPrincipal

            principal = (
                self.db.query(ConsentPrincipal)
                .filter(
                    ConsentPrincipal.organization_id == org_id,
                    ConsentPrincipal.canonical_ref == bank_ref,
                )
                .first()
            )
            if principal:
                return principal

        from app.models.consent_principal import ConsentPrincipal, ConsentPrincipalIdentifier

        for id_type, token in normalized.items():
            fp = self.fingerprint(org_id, id_type, token)
            match = (
                self.db.query(ConsentPrincipalIdentifier)
                .join(ConsentPrincipal)
                .filter(
                    ConsentPrincipal.organization_id == org_id,
                    ConsentPrincipalIdentifier.identifier_type == id_type,
                    ConsentPrincipalIdentifier.token_fingerprint == fp,
                )
                .first()
            )
            if match:
                return match.principal
        return None

    def resolve_config_for_org(self, org_id: UUID) -> dict[str, Any]:
        from app.models.organization_settings import OrganizationSettings

        settings = (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )
        if settings and settings.consent_industry_config and banking_pack_enabled(settings.consent_industry_config):
            return settings.consent_industry_config
        return default_banking_consent_config()
