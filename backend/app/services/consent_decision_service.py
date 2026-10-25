"""Evaluate whether a purpose is currently consented for a data principal."""

from __future__ import annotations

import hashlib
import time
from datetime import datetime, timezone
from uuid import UUID

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.redis_client import decision_cache
from app.models.consent import LegalBasis, Purpose
from app.models.consent_receipt import ConsentReceipt
from app.models.enforcement import (
    DenyBehavior,
    EnforcementDecision,
    EnforcementEvent,
    EnforcementMode,
    PurposeEnforcementConfig,
)
from app.models.integration_property import IntegrationProperty
from app.schemas.enforcement import ConsentDecisionRequest, ConsentDecisionResponse, DecisionTokenMintRequest, SuppressionCheckRequest, SuppressionCheckResponse, SuppressionCheckResult
from app.services.consent_principal_service import ConsentPrincipalService
from app.utils.india_phone import normalize_india_phone


_MODE_RANK = {
    EnforcementMode.disabled: 0,
    EnforcementMode.shadow: 1,
    EnforcementMode.enforced: 2,
}


def effective_enforcement_mode(
    property_mode: EnforcementMode,
    purpose_mode: EnforcementMode,
) -> EnforcementMode:
    """Weaker mode wins — both must be enforced before blocking."""
    if _MODE_RANK[property_mode] <= _MODE_RANK[purpose_mode]:
        return property_mode
    return purpose_mode


class ConsentDecisionService:
    def __init__(self, db: Session):
        self.db = db
        self.principal_service = ConsentPrincipalService(db)

    def evaluate(
        self,
        *,
        property_obj: IntegrationProperty,
        payload: ConsentDecisionRequest,
        mint_token: bool = True,
        decision_token_header: str | None = None,
    ) -> ConsentDecisionResponse:
        if decision_token_header:
            from app.services.consent_decision_token_service import ConsentDecisionTokenService

            token_svc = ConsentDecisionTokenService(self.db)
            from_token = token_svc.evaluate_from_token_header(
                property_obj=property_obj,
                token=decision_token_header,
                purpose_key=payload.purpose_key,
            )
            if from_token is not None:
                purpose = self._resolve_purpose(property_obj.organization_id, payload.purpose_key)
                if purpose:
                    principal_fp = self._principal_fingerprint(property_obj.organization_id, payload)
                    return ConsentDecisionResponse(
                        allowed=from_token.allowed,
                        purpose_id=purpose.id,
                        purpose_name=purpose.name,
                        legal_basis=from_token.legal_basis,
                        effective_mode=from_token.effective_mode,
                        deny_behavior=None,
                        decision=from_token.decision,
                        receipt_id=None,
                        principal_fingerprint=principal_fp,
                        decision_token=decision_token_header,
                        decision_token_expires_in=None,
                        evaluated_at=datetime.now(timezone.utc),
                        source="token",
                    )

        started = time.perf_counter()
        org_id = property_obj.organization_id

        purpose = self._resolve_purpose(org_id, payload.purpose_key)
        if purpose is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purpose not found")

        live_version = purpose.current_live_version
        legal_basis = live_version.legal_basis if live_version else LegalBasis.consent

        purpose_cfg = (
            self.db.query(PurposeEnforcementConfig)
            .filter(
                PurposeEnforcementConfig.organization_id == org_id,
                PurposeEnforcementConfig.purpose_id == purpose.id,
            )
            .first()
        )
        purpose_mode = purpose_cfg.mode if purpose_cfg else EnforcementMode.disabled
        deny_behavior = purpose_cfg.deny_behavior if purpose_cfg else DenyBehavior.reject
        mode = effective_enforcement_mode(property_obj.enforcement_mode, purpose_mode)

        principal_fp = self._principal_fingerprint(org_id, payload)
        cache_key = f"{org_id}:{property_obj.id}:{purpose.id}:{principal_fp}"
        cached = decision_cache.get(cache_key)
        if cached:
            return ConsentDecisionResponse(**cached)

        if legal_basis != LegalBasis.consent:
            response = self._build_response(
                property_obj=property_obj,
                purpose=purpose,
                legal_basis=legal_basis,
                allowed=True,
                mode=mode,
                deny_behavior=deny_behavior,
                receipt_id=None,
                principal_fp=principal_fp,
                decision=EnforcementDecision.allowed.value,
                mint_token=mint_token,
                payload=payload,
            )
            decision_cache.set(cache_key, response.model_dump(mode="json"))
            self._log_event(
                property_obj=property_obj,
                purpose_id=purpose.id,
                principal_fp=principal_fp,
                decision=EnforcementDecision.allowed.value,
                legal_basis=legal_basis.value,
                effective_mode=mode.value,
                receipt_id=None,
                collection_point=payload.collection_point,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
            return response

        receipt = self._latest_receipt(property_obj, payload, principal_fp)
        purpose_key = str(purpose.id)
        consented = False
        if receipt and isinstance(receipt.consented_purposes, dict):
            if purpose_key in receipt.consented_purposes:
                consented = bool(receipt.consented_purposes.get(purpose_key))
            else:
                # Legacy receipts may key by purpose name
                consented = bool(receipt.consented_purposes.get(purpose.name))

        allowed = consented
        if not allowed and mode == EnforcementMode.shadow:
            decision = EnforcementDecision.shadow_would_deny.value
        elif allowed:
            decision = EnforcementDecision.allowed.value
        else:
            decision = EnforcementDecision.denied.value

        response = self._build_response(
            property_obj=property_obj,
            purpose=purpose,
            legal_basis=legal_basis,
            allowed=allowed,
            mode=mode,
            deny_behavior=deny_behavior if not allowed else None,
            receipt_id=receipt.id if receipt else None,
            principal_fp=principal_fp,
            decision=decision,
            mint_token=mint_token,
            payload=payload,
        )
        decision_cache.set(cache_key, response.model_dump(mode="json"))
        self._log_event(
            property_obj=property_obj,
            purpose_id=purpose.id,
            principal_fp=principal_fp,
            decision=decision,
            legal_basis=legal_basis.value,
            effective_mode=mode.value,
            receipt_id=receipt.id if receipt else None,
            collection_point=payload.collection_point,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return response

    def invalidate_cache_for_org(self, org_id: UUID, principal_fp: str | None = None) -> None:
        prefix = f"{org_id}:"
        if principal_fp:
            prefix = f"{org_id}:"
            # Invalidate all property/purpose combos for this principal fingerprint.
            decision_cache.invalidate_prefix(f"{org_id}:")
        else:
            decision_cache.invalidate_prefix(prefix)

    def _resolve_purpose(self, org_id: UUID, purpose_key: str) -> Purpose | None:
        try:
            purpose_uuid = UUID(purpose_key)
            purpose = (
                self.db.query(Purpose)
                .filter(Purpose.organization_id == org_id, Purpose.id == purpose_uuid)
                .first()
            )
            if purpose:
                return purpose
        except ValueError:
            pass

        return (
            self.db.query(Purpose)
            .filter(Purpose.organization_id == org_id, Purpose.name.ilike(purpose_key))
            .first()
        )

    def _normalize_identifiers(self, payload: ConsentDecisionRequest) -> dict[str, str]:
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

    def _principal_fingerprint(self, org_id: UUID, payload: ConsentDecisionRequest) -> str:
        normalized = self._normalize_identifiers(payload)
        parts = sorted(
            self.principal_service.fingerprint(org_id, id_type, token)
            for id_type, token in normalized.items()
        )
        joined = "|".join(parts)
        return hashlib.sha256(joined.encode()).hexdigest()

    def _latest_receipt(
        self,
        property_obj: IntegrationProperty,
        payload: ConsentDecisionRequest,
        principal_fp: str,
    ) -> ConsentReceipt | None:
        normalized = self._normalize_identifiers(payload)
        principal = self.principal_service.find_principal_for_dsar(property_obj.organization_id, normalized)

        query = self.db.query(ConsentReceipt).filter(
            ConsentReceipt.organization_id == property_obj.organization_id,
            ConsentReceipt.property_id == property_obj.id,
        )
        if principal:
            query = query.filter(ConsentReceipt.principal_id == principal.id)
        elif payload.session_id:
            query = query.filter(ConsentReceipt.session_id == payload.session_id.strip())
        else:
            return None

        return query.order_by(ConsentReceipt.created_at.desc()).first()

    def _build_response(
        self,
        *,
        property_obj: IntegrationProperty,
        purpose: Purpose,
        legal_basis: LegalBasis,
        allowed: bool,
        mode: EnforcementMode,
        deny_behavior: DenyBehavior | None,
        receipt_id: UUID | None,
        principal_fp: str,
        decision: str,
        mint_token: bool,
        payload: ConsentDecisionRequest,
    ) -> ConsentDecisionResponse:
        token: str | None = None
        token_ttl: int | None = None
        if mint_token:
            from app.services.consent_decision_token_service import ConsentDecisionTokenService

            minted = ConsentDecisionTokenService(self.db).mint(
                property_obj=property_obj,
                payload=DecisionTokenMintRequest(
                    principal_email=payload.principal_email,
                    principal_phone=payload.principal_phone,
                    session_id=payload.session_id,
                ),
            )
            token = minted.decision_token
            token_ttl = minted.decision_token_expires_in

        return ConsentDecisionResponse(
            allowed=allowed,
            purpose_id=purpose.id,
            purpose_name=purpose.name,
            legal_basis=legal_basis.value,
            effective_mode=mode,
            deny_behavior=deny_behavior,
            decision=decision,
            receipt_id=receipt_id,
            principal_fingerprint=principal_fp,
            decision_token=token,
            decision_token_expires_in=token_ttl,
            evaluated_at=datetime.now(timezone.utc),
            source="api",
        )

    def _log_event(
        self,
        *,
        property_obj: IntegrationProperty,
        purpose_id: UUID,
        principal_fp: str,
        decision: str,
        legal_basis: str,
        effective_mode: str,
        receipt_id: UUID | None,
        collection_point: str | None,
        latency_ms: int,
    ) -> None:
        event = EnforcementEvent(
            organization_id=property_obj.organization_id,
            property_id=property_obj.id,
            purpose_id=purpose_id,
            principal_fingerprint=principal_fp,
            decision=decision,
            legal_basis=legal_basis,
            effective_mode=effective_mode,
            receipt_id=receipt_id,
            collection_point=collection_point,
            latency_ms=latency_ms,
        )
        self.db.add(event)
        self.db.commit()

    def evaluate_suppression_batch(
        self,
        *,
        property_obj: IntegrationProperty,
        payload: SuppressionCheckRequest,
    ) -> SuppressionCheckResponse:
        """Bulk allowed/denied check for marketing-send filtering."""
        purpose = self._resolve_purpose(property_obj.organization_id, payload.purpose_key)
        if purpose is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Purpose not found")

        results: list[SuppressionCheckResult] = []
        for item in payload.identifiers:
            if not item.principal_email and not item.principal_phone:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="Each identifier must include principal_email or principal_phone",
                )
            decision_req = ConsentDecisionRequest(
                purpose_key=payload.purpose_key,
                principal_email=item.principal_email,
                principal_phone=item.principal_phone,
            )
            evaluation = self.evaluate(
                property_obj=property_obj,
                payload=decision_req,
                mint_token=False,
            )
            results.append(
                SuppressionCheckResult(
                    ref=item.ref,
                    principal_fingerprint=evaluation.principal_fingerprint,
                    allowed=evaluation.allowed,
                    decision=evaluation.decision,
                )
            )

        return SuppressionCheckResponse(
            purpose_key=payload.purpose_key,
            purpose_id=purpose.id,
            purpose_name=purpose.name,
            results=results,
        )
