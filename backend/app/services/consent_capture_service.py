"""Shared consent capture helpers for web, mobile, and banking APIs."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings as app_settings
from app.models.consent import ConsentNotice, ConsentNoticeVersion, LegalBasis
from app.models.consent_banner import ConsentBanner
from app.models.consent_receipt import ConsentReceipt
from app.models.integration_property import IntegrationProperty
from app.models.organization_settings import OrganizationSettings
from app.models.property_banner_association import PropertyBannerAssociation
from app.schemas.consent_banking import ConsentIdentifierInput
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.contracts.banner_contract import BannerConfigContract
from app.utils.industry_packs import banking_pack_enabled, ensure_banking_config, is_banking_industry


@dataclass
class ConsentCaptureResult:
    receipt: ConsentReceipt
    active_banner: ConsentBanner | None
    banner_id: UUID | None
    live_version: ConsentNoticeVersion | None
    capture_channel: str
    banking_metadata: dict[str, Any]


class ConsentCaptureService:
    def __init__(self, db: Session):
        self.db = db

    def _org_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )

    def _resolve_journey_from_property(
        self,
        property_obj: IntegrationProperty,
        settings: OrganizationSettings | None,
        journey_key: str | None,
    ) -> str | None:
        if journey_key:
            return journey_key
        if not settings or not settings.consent_industry_config:
            return None
        cfg = settings.consent_industry_config
        mapped = (cfg.get("property_journey_map") or {}).get(str(property_obj.id))
        return mapped

    def _default_channel(self, property_obj: IntegrationProperty) -> str:
        if property_obj.property_type.value in ("android", "ios"):
            return "mobile_banking"
        if property_obj.property_type.value == "api":
            return "api"
        return "web"

    def create_receipt(
        self,
        *,
        property_obj: IntegrationProperty,
        session_id: str,
        consented_purposes: dict[str, bool] | list[str],
        language: str,
        ip_hash: str,
        user_agent: str,
        principal_email: str | None = None,
        principal_phone: str | None = None,
        journey_key: str | None = None,
        capture_channel: str | None = None,
        bank_customer_ref: str | None = None,
        identifiers: list[ConsentIdentifierInput] | None = None,
        require_banking_validation: bool = False,
        capture_mode: str = "online",
    ) -> ConsentCaptureResult:
        org_id = property_obj.organization_id
        settings = self._org_settings(org_id)
        banking_active = (
            settings
            and is_banking_industry(settings.primary_industry)
            and banking_pack_enabled(ensure_banking_config(settings.primary_industry, settings.consent_industry_config) or {})
        )

        if require_banking_validation and not banking_active:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Banking consent endpoint requires Banking industry configuration",
            )

        active_assoc = (
            self.db.query(PropertyBannerAssociation)
            .filter(
                PropertyBannerAssociation.property_id == property_obj.id,
                PropertyBannerAssociation.status == "active",
            )
            .first()
        )

        banner_snapshot: dict[str, Any] = {}
        active_banner = None
        banner_id = None
        if active_assoc:
            banner_id = active_assoc.banner_id
            active_banner = self.db.query(ConsentBanner).filter(ConsentBanner.id == banner_id).first()
            raw_trans = BannerConfigContract.get_banner_translations(self.db, banner_id, language)
            banner_snapshot = {
                "config": BannerConfigContract.get_banner_config(self.db, banner_id),
                "purposes": BannerConfigContract.get_banner_purposes(self.db, banner_id),
                "translations": {
                    "title": raw_trans.get("title") or (active_banner.heading if active_banner else "We value your privacy"),
                    "description": raw_trans.get("description") or (active_banner.body_text if active_banner else ""),
                    "accept_text": raw_trans.get("accept_text") or (active_banner.cta_accept if active_banner else "Accept"),
                    "reject_text": raw_trans.get("reject_text") or (active_banner.cta_reject if active_banner else "Reject All"),
                    "customize_text": raw_trans.get("customize_text") or (active_banner.cta_customize if active_banner else "Customize"),
                },
            }

        live_version = None
        if property_obj.consent_notice_id:
            notice = self.db.get(ConsentNotice, property_obj.consent_notice_id)
            if notice and notice.current_live_version_id:
                live_version = self.db.get(ConsentNoticeVersion, notice.current_live_version_id)
                if banking_active and live_version is None:
                    raise HTTPException(
                        status.HTTP_400_BAD_REQUEST,
                        detail="Consent cannot be recorded without a live notice version (DPDPA Section 5)",
                    )

        purposes_dict: dict[str, bool]
        if isinstance(consented_purposes, list):
            purposes_dict = {p: True for p in consented_purposes}
        else:
            purposes_dict = consented_purposes

        basis_type = self._resolve_basis_type(live_version, purposes_dict)

        resolved_journey = self._resolve_journey_from_property(property_obj, settings, journey_key)
        resolved_channel = capture_channel or self._default_channel(property_obj)

        banking_ctx = None
        generic_principal_id: UUID | None = None
        generic_identifier_snapshot: list[dict[str, str]] | None = None
        principal_svc = ConsentPrincipalService(self.db)

        if banking_active:
            banking_ctx = principal_svc.prepare_banking_context(
                org_id=org_id,
                settings=settings,
                journey_key=resolved_journey,
                capture_channel=resolved_channel,
                bank_customer_ref=bank_customer_ref,
                identifiers=identifiers or [],
                principal_email=principal_email,
                principal_phone=principal_phone,
                notice_version_id=live_version.id if live_version else None,
                require_live_notice=require_banking_validation,
                capture_mode=capture_mode,
            )
            if banking_ctx:
                if banking_ctx.principal_email:
                    principal_email = banking_ctx.principal_email
                if banking_ctx.principal_phone:
                    principal_phone = banking_ctx.principal_phone
                resolved_channel = banking_ctx.capture_channel or resolved_channel
                resolved_journey = banking_ctx.journey_key or resolved_journey
        elif principal_email or principal_phone:
            generic_principal_id, normalized_ids, generic_identifier_snapshot = (
                principal_svc.link_principal_from_raw(
                    org_id,
                    principal_email=principal_email,
                    principal_phone=principal_phone,
                    channel=resolved_channel,
                )
            )
            if normalized_ids.get("email"):
                principal_email = normalized_ids["email"]
            if normalized_ids.get("mobile"):
                principal_phone = normalized_ids["mobile"]

        receipt_data = json.dumps(
            {
                "property_id": str(property_obj.id),
                "session_id": session_id,
                "consented_purposes": purposes_dict,
                "ip_hash": ip_hash,
                "journey_key": resolved_journey,
                "capture_channel": resolved_channel,
            },
            sort_keys=True,
        )
        signature = hmac.new(app_settings.SECRET_KEY.encode(), receipt_data.encode(), hashlib.sha256).hexdigest()

        receipt = ConsentReceipt(
            property_id=property_obj.id,
            organization_id=org_id,
            session_id=session_id,
            consented_purposes=purposes_dict,
            basis_type=basis_type,
            ip_hash=ip_hash,
            user_agent=user_agent,
            language=language[:10] if language else "en",
            principal_email=principal_email,
            principal_phone=principal_phone,
            banner_snapshot=banner_snapshot,
            signature=signature,
            capture_channel=resolved_channel,
            journey_key=resolved_journey,
            notice_version_id=live_version.id if live_version else None,
        )

        if banking_ctx:
            receipt.principal_id = banking_ctx.principal_id
            receipt.bank_customer_ref = banking_ctx.bank_customer_ref
            receipt.identifier_snapshot = banking_ctx.identifier_snapshot
        elif generic_principal_id:
            receipt.principal_id = generic_principal_id
            receipt.identifier_snapshot = generic_identifier_snapshot

        self.db.add(receipt)
        self.db.flush()

        resolved_principal_id = (
            banking_ctx.principal_id
            if banking_ctx and banking_ctx.principal_id
            else generic_principal_id
        )
        banking_metadata = {
            "identifier_types_used": banking_ctx.identifier_types_used if banking_ctx else [],
            "bank_customer_ref": banking_ctx.bank_customer_ref if banking_ctx else None,
            "principal_id": str(resolved_principal_id) if resolved_principal_id else None,
        }

        return ConsentCaptureResult(
            receipt=receipt,
            active_banner=active_banner,
            banner_id=banner_id,
            live_version=live_version,
            capture_channel=resolved_channel,
            banking_metadata=banking_metadata,
        )

    @staticmethod
    def _resolve_basis_type(
        live_version: ConsentNoticeVersion | None,
        purposes: dict[str, bool],
    ) -> str | None:
        has_consent_basis = False
        has_legitimate_basis = False
        if live_version:
            purpose_basis_map = {}
            for p in live_version.purposes:
                purpose_basis_map[str(p.purpose_id)] = p.legal_basis
                purpose_basis_map[p.name] = p.legal_basis
            for pid, consented in purposes.items():
                if consented and pid in purpose_basis_map:
                    basis = purpose_basis_map[pid]
                    if basis == LegalBasis.consent:
                        has_consent_basis = True
                    elif basis == LegalBasis.legitimate_use:
                        has_legitimate_basis = True
        if has_consent_basis and has_legitimate_basis:
            return "mixed"
        if has_consent_basis:
            return "consent"
        if has_legitimate_basis:
            return "notice"
        return None
