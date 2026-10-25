"""Mint and verify bundle decision tokens from receipts and principal identifiers."""

from __future__ import annotations

import hashlib
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.consent import LegalBasis, Purpose
from app.models.consent_receipt import ConsentReceipt
from app.models.enforcement import EnforcementMode, PurposeEnforcementConfig
from app.models.integration_property import IntegrationProperty
from app.schemas.enforcement import (
    ConsentDecisionRequest,
    DecisionTokenMintRequest,
    DecisionTokenResponse,
    DecisionTokenVerifyRequest,
    DecisionTokenVerifyResponse,
    PurposeDecisionDetail,
)
from app.services.consent_decision_service import ConsentDecisionService, effective_enforcement_mode
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.decision_token_service import (
    DecisionTokenPayload,
    decode_decision_token,
    ensure_property_decision_secret,
    lookup_purpose_allowed,
    mint_decision_token,
)
from app.utils.india_phone import normalize_india_phone


class ConsentDecisionTokenService:
    def __init__(self, db: Session):
        self.db = db
        self.principal_service = ConsentPrincipalService(db)
        self.decision_service = ConsentDecisionService(db)

    def mint(
        self,
        *,
        property_obj: IntegrationProperty,
        payload: DecisionTokenMintRequest,
    ) -> DecisionTokenResponse:
        principal_fp = self._principal_fingerprint(property_obj.organization_id, payload)
        receipt = self._latest_receipt(property_obj, payload, principal_fp)
        purpose_rights, decisions = self._build_rights_map(property_obj, receipt)
        secret = ensure_property_decision_secret(self.db, property_obj)
        token, ttl = mint_decision_token(
            property_id=property_obj.id,
            signing_secret=secret,
            principal_fingerprint=principal_fp,
            purpose_rights=purpose_rights,
        )
        return DecisionTokenResponse(
            decision_token=token,
            decision_token_expires_in=ttl,
            principal_fingerprint=principal_fp,
            decisions=decisions,
        )

    def mint_for_receipt(
        self,
        *,
        property_obj: IntegrationProperty,
        receipt: ConsentReceipt,
        principal_email: str | None = None,
        principal_phone: str | None = None,
        session_id: str | None = None,
    ) -> DecisionTokenResponse | None:
        payload = DecisionTokenMintRequest(
            principal_email=principal_email,
            principal_phone=principal_phone,
            session_id=session_id or receipt.session_id,
        )
        try:
            principal_fp = self._principal_fingerprint(property_obj.organization_id, payload)
        except HTTPException:
            return None
        purpose_rights, decisions = self._build_rights_map(property_obj, receipt)
        secret = ensure_property_decision_secret(self.db, property_obj)
        token, ttl = mint_decision_token(
            property_id=property_obj.id,
            signing_secret=secret,
            principal_fingerprint=principal_fp,
            purpose_rights=purpose_rights,
        )
        return DecisionTokenResponse(
            decision_token=token,
            decision_token_expires_in=ttl,
            principal_fingerprint=principal_fp,
            decisions=decisions,
        )

    def verify(
        self,
        *,
        property_obj: IntegrationProperty,
        payload: DecisionTokenVerifyRequest,
    ) -> DecisionTokenVerifyResponse:
        secret = ensure_property_decision_secret(self.db, property_obj)
        parsed = decode_decision_token(secret, payload.token)
        if parsed is None:
            return DecisionTokenVerifyResponse(valid=False, reason="invalid_or_expired_token")

        if parsed.property_id != property_obj.id:
            return DecisionTokenVerifyResponse(valid=False, reason="property_mismatch")

        if payload.principal_fingerprint and payload.principal_fingerprint != parsed.principal_fingerprint:
            return DecisionTokenVerifyResponse(
                valid=False,
                reason="principal_mismatch",
                principal_fingerprint=parsed.principal_fingerprint,
            )

        if payload.purpose_key:
            allowed = self._resolve_allowed_from_token(property_obj, parsed, payload.purpose_key)
            if allowed is None:
                return DecisionTokenVerifyResponse(
                    valid=True,
                    reason="purpose_not_in_token",
                    principal_fingerprint=parsed.principal_fingerprint,
                    expires_in=parsed.expires_in,
                )
            detail = self._purpose_detail(property_obj, payload.purpose_key, allowed)
            return DecisionTokenVerifyResponse(
                valid=True,
                allowed=allowed,
                purpose_key=payload.purpose_key,
                principal_fingerprint=parsed.principal_fingerprint,
                effective_mode=detail.effective_mode if detail else None,
                decision=detail.decision if detail else None,
                expires_in=parsed.expires_in,
                decisions={payload.purpose_key: detail} if detail else None,
            )

        decisions = {
            key: self._purpose_detail(property_obj, key, allowed)
            for key, allowed in parsed.purpose_rights.items()
            if not self._looks_like_uuid(key)
        }
        decisions = {k: v for k, v in decisions.items() if v is not None}
        return DecisionTokenVerifyResponse(
            valid=True,
            principal_fingerprint=parsed.principal_fingerprint,
            expires_in=parsed.expires_in,
            decisions=decisions,
        )

    def evaluate_from_token_header(
        self,
        *,
        property_obj: IntegrationProperty,
        token: str,
        purpose_key: str,
    ) -> PurposeDecisionDetail | None:
        secret = ensure_property_decision_secret(self.db, property_obj)
        parsed = decode_decision_token(secret, token)
        if parsed is None or parsed.property_id != property_obj.id:
            return None
        allowed = self._resolve_allowed_from_token(property_obj, parsed, purpose_key)
        if allowed is None:
            return None
        return self._purpose_detail(property_obj, purpose_key, allowed)

    def _resolve_allowed_from_token(
        self,
        property_obj: IntegrationProperty,
        parsed: DecisionTokenPayload,
        purpose_key: str,
    ) -> bool | None:
        direct = lookup_purpose_allowed(parsed, purpose_key)
        if direct is not None:
            return direct
        purpose = self.decision_service._resolve_purpose(property_obj.organization_id, purpose_key)
        if purpose is None:
            return None
        return lookup_purpose_allowed(parsed, str(purpose.id)) or lookup_purpose_allowed(parsed, purpose.name)

    def _purpose_detail(
        self,
        property_obj: IntegrationProperty,
        purpose_key: str,
        allowed: bool,
    ) -> PurposeDecisionDetail | None:
        purpose = self.decision_service._resolve_purpose(property_obj.organization_id, purpose_key)
        if purpose is None:
            return None
        live_version = purpose.current_live_version
        legal_basis = live_version.legal_basis if live_version else LegalBasis.consent
        purpose_cfg = (
            self.db.query(PurposeEnforcementConfig)
            .filter(
                PurposeEnforcementConfig.organization_id == property_obj.organization_id,
                PurposeEnforcementConfig.purpose_id == purpose.id,
            )
            .first()
        )
        purpose_mode = purpose_cfg.mode if purpose_cfg else EnforcementMode.disabled
        mode = effective_enforcement_mode(property_obj.enforcement_mode, purpose_mode)
        if legal_basis != LegalBasis.consent:
            allowed = True
            reason = "non_consent_basis_always_allowed"
            decision = "allowed"
        elif not allowed and mode == EnforcementMode.shadow:
            reason = "purpose_denied"
            decision = "shadow_would_deny"
        elif allowed:
            reason = "purpose_consented"
            decision = "allowed"
        else:
            reason = "purpose_denied"
            decision = "denied"
        return PurposeDecisionDetail(
            allowed=allowed,
            legal_basis=legal_basis.value,
            effective_mode=mode,
            reason=reason,
            decision=decision,
        )

    def _build_rights_map(
        self,
        property_obj: IntegrationProperty,
        receipt: ConsentReceipt | None,
    ) -> tuple[dict[str, bool], dict[str, PurposeDecisionDetail]]:
        receipt_map: dict[str, bool] = {}
        if receipt and isinstance(receipt.consented_purposes, dict):
            receipt_map = {str(k): bool(v) for k, v in receipt.consented_purposes.items()}

        purposes = (
            self.db.query(Purpose)
            .filter(
                Purpose.organization_id == property_obj.organization_id,
                Purpose.archived_at.is_(None),
            )
            .all()
        )
        rights: dict[str, bool] = {}
        details: dict[str, PurposeDecisionDetail] = {}
        for purpose in purposes:
            live_version = purpose.current_live_version
            legal_basis = live_version.legal_basis if live_version else LegalBasis.consent
            if legal_basis != LegalBasis.consent:
                allowed = True
            else:
                allowed = receipt_map.get(str(purpose.id), receipt_map.get(purpose.name, False))
            rights[purpose.name] = allowed
            rights[str(purpose.id)] = allowed
            detail = self._purpose_detail(property_obj, purpose.name, allowed)
            if detail:
                details[purpose.name] = detail
        return rights, details

    def _normalize_identifiers(self, payload: DecisionTokenMintRequest) -> dict[str, str]:
        normalized: dict[str, str] = {}
        if payload.principal_email:
            try:
                normalized["email"] = validate_email(
                    payload.principal_email, check_deliverability=False
                ).normalized
            except EmailNotValidError as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid email address") from exc
        if payload.principal_phone:
            normalized["mobile"] = normalize_india_phone(payload.principal_phone)
        if payload.session_id and payload.session_id.strip():
            normalized["session"] = payload.session_id.strip()
        if not normalized:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="At least one of principal_email, principal_phone, or session_id is required",
            )
        return normalized

    def _principal_fingerprint(self, org_id: UUID, payload: DecisionTokenMintRequest) -> str:
        normalized = self._normalize_identifiers(payload)
        parts = sorted(
            self.principal_service.fingerprint(org_id, id_type, token)
            for id_type, token in normalized.items()
        )
        return hashlib.sha256("|".join(parts).encode()).hexdigest()

    def _latest_receipt(
        self,
        property_obj: IntegrationProperty,
        payload: DecisionTokenMintRequest,
        principal_fp: str,
    ) -> ConsentReceipt | None:
        req = ConsentDecisionRequest(
            purpose_key="unused",
            principal_email=payload.principal_email,
            principal_phone=payload.principal_phone,
            session_id=payload.session_id,
        )
        return self.decision_service._latest_receipt(property_obj, req, principal_fp)

    @staticmethod
    def _looks_like_uuid(value: str) -> bool:
        try:
            UUID(value)
            return True
        except ValueError:
            return False
