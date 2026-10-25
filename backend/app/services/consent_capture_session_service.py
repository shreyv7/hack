"""Assisted consent capture sessions with OTP verification and offline sync."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.consent_capture_session import (
    ConsentCaptureMode,
    ConsentCaptureSession,
    ConsentCaptureSessionStatus,
)
from app.models.consent_receipt import ConsentReceipt
from app.models.integration_property import IntegrationProperty
from app.models.organization_settings import OrganizationSettings
from app.schemas.consent_banking import ConsentIdentifierInput
from app.schemas.consent_capture_session import (
    ConsentCaptureSessionCreate,
    ConsentCaptureSessionRead,
    OfflineSessionSyncItem,
    OfflineSessionSyncResultItem,
    StaffMetadataInput,
)
from app.services.consent_capture_service import ConsentCaptureService
from app.services.consent_otp_sms_service import send_consent_otp_sms
from app.services.consent_principal_service import ConsentPrincipalService
from app.services.otp_service import OTP_MAX_ATTEMPTS, OtpService
from app.utils.india_phone import normalize_india_phone
from app.utils.industry_packs import banking_pack_enabled, ensure_banking_config, is_banking_industry


class ConsentCaptureSessionService:
    def __init__(self, db: Session):
        self.db = db

    def _org_settings(self, org_id: UUID) -> OrganizationSettings | None:
        return (
            self.db.query(OrganizationSettings)
            .filter(OrganizationSettings.organization_id == org_id)
            .first()
        )

    def _require_banking(self, settings: OrganizationSettings | None) -> dict[str, Any]:
        if settings is None or not is_banking_industry(settings.primary_industry):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Assisted capture requires Banking & Financial Services industry",
            )
        cfg = ensure_banking_config(settings.primary_industry, settings.consent_industry_config)
        if not cfg or not banking_pack_enabled(cfg):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Banking consent pack is not enabled")
        return cfg

    def _journey_cfg(self, config: dict[str, Any], journey_key: str) -> dict[str, Any]:
        for j in config.get("journeys", []):
            if j.get("key") == journey_key:
                return j
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unknown journey '{journey_key}'")

    @staticmethod
    def _mask_mobile(mobile: str | None) -> str | None:
        if not mobile or len(mobile) < 4:
            return mobile
        return f"{'*' * (len(mobile) - 4)}{mobile[-4:]}"

    def _validate_staff_metadata(
        self,
        journey: dict[str, Any],
        staff: StaffMetadataInput | None,
    ) -> dict[str, Any] | None:
        if not journey.get("staff_metadata_required"):
            return staff.model_dump(exclude_none=True) if staff else None
        if staff is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Staff metadata is required for this journey",
            )
        channel = journey.get("channel", "")
        if channel == "merchant":
            if not staff.merchant_id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="merchant_id is required")
        else:
            if not staff.branch_code or not staff.staff_id:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="branch_code and staff_id are required",
                )
        return staff.model_dump(exclude_none=True)

    def _validate_payload(
        self,
        *,
        org_id: UUID,
        settings: OrganizationSettings,
        config: dict[str, Any],
        journey_key: str,
        capture_mode: str,
        bank_customer_ref: str | None,
        identifiers: list[ConsentIdentifierInput],
        principal_email: str | None,
        principal_phone: str | None,
    ) -> tuple[dict[str, Any], dict[str, str], str | None]:
        journey = self._journey_cfg(config, journey_key)
        if capture_mode == "offline" and not journey.get("allow_offline_capture", True):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"Journey '{journey_key}' does not allow offline capture",
            )
        principal_svc = ConsentPrincipalService(self.db)
        normalized, _ = principal_svc._collect_values(  # noqa: SLF001
            config,
            journey_key,
            journey.get("channel"),
            bank_customer_ref,
            identifiers,
            principal_email,
            principal_phone,
            capture_mode=capture_mode,
        )
        mobile = normalized.get("mobile")
        mobile_e164 = normalize_india_phone(mobile) if mobile else None
        return journey, normalized, mobile_e164

    def create_session(
        self,
        property_obj: IntegrationProperty,
        body: ConsentCaptureSessionCreate,
        *,
        ip_hash: str = "assisted-capture",
        user_agent: str | None = None,
    ) -> ConsentCaptureSessionRead:
        org_id = property_obj.organization_id
        settings = self._org_settings(org_id)
        config = self._require_banking(settings)

        existing = (
            self.db.query(ConsentCaptureSession)
            .filter(
                ConsentCaptureSession.property_id == property_obj.id,
                ConsentCaptureSession.client_session_id == body.client_session_id,
            )
            .first()
        )
        if existing and existing.status == ConsentCaptureSessionStatus.completed:
            return self._to_read(existing, journey=self._journey_cfg(config, existing.journey_key))

        journey, normalized, mobile_e164 = self._validate_payload(
            org_id=org_id,
            settings=settings,  # type: ignore[arg-type]
            config=config,
            journey_key=body.journey_key,
            capture_mode=body.capture_mode,
            bank_customer_ref=body.bank_customer_ref,
            identifiers=body.identifiers,
            principal_email=body.principal_email,
            principal_phone=body.principal_phone,
        )
        staff_meta = self._validate_staff_metadata(journey, body.staff_metadata)

        otp_required = bool(journey.get("otp_required", False))
        capture_channel = body.capture_channel or journey.get("channel")

        payload = {
            "session_id": body.session_id,
            "consented_purposes": body.consented_purposes,
            "language": body.language,
            "bank_customer_ref": body.bank_customer_ref,
            "principal_email": body.principal_email,
            "principal_phone": body.principal_phone,
            "identifiers": [{"type": i.type, "token": i.token} for i in body.identifiers],
            "normalized_preview": {k: ConsentPrincipalService.fingerprint(org_id, k, v) for k, v in normalized.items()},
        }

        if existing:
            session = existing
            session.payload_json = payload
            session.staff_metadata_json = staff_meta
            session.mobile_e164 = mobile_e164
            session.journey_key = body.journey_key
            session.capture_channel = capture_channel
        else:
            session = ConsentCaptureSession(
                organization_id=org_id,
                property_id=property_obj.id,
                client_session_id=body.client_session_id,
                journey_key=body.journey_key,
                capture_channel=capture_channel,
                status=ConsentCaptureSessionStatus.draft,
                capture_mode=ConsentCaptureMode.offline if body.capture_mode == "offline" else ConsentCaptureMode.online,
                payload_json=payload,
                staff_metadata_json=staff_meta,
                mobile_e164=mobile_e164,
                client_captured_at=body.client_captured_at,
            )
            self.db.add(session)
            self.db.flush()

        if body.capture_mode == "offline":
            session.synced_at = datetime.now(timezone.utc)
            session.status = ConsentCaptureSessionStatus.verified
            session.verified_at = datetime.now(timezone.utc)
            self.db.commit()
            self.db.refresh(session)
            return self.complete_session(property_obj, session.id, ip_hash=ip_hash, user_agent=user_agent)

        if otp_required:
            if not mobile_e164:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mobile number required for OTP verification")
            self._issue_otp(session, mobile_e164, ip_hash, user_agent)
        else:
            session.status = ConsentCaptureSessionStatus.verified
            session.verified_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(session)

        if body.auto_complete and session.status == ConsentCaptureSessionStatus.verified:
            return self.complete_session(property_obj, session.id, ip_hash=ip_hash, user_agent=user_agent)
        return self._to_read(session, journey=journey)

    def _issue_otp(
        self,
        session: ConsentCaptureSession,
        mobile: str,
        ip_hash: str,
        user_agent: str | None,
    ) -> None:
        otp = OtpService.generate_otp()
        session.otp_code_hash = OtpService.hash_otp(otp, str(session.id))
        session.otp_expires_at = OtpService.otp_expires_at()
        session.otp_sent_count = (session.otp_sent_count or 0) + 1
        session.last_otp_sent_at = datetime.now(timezone.utc)
        session.status = ConsentCaptureSessionStatus.otp_pending
        send_consent_otp_sms(
            self.db,
            organization_id=session.organization_id,
            property_id=session.property_id,
            session_id=session.payload_json.get("session_id", str(session.id)),
            to_phone=mobile,
            otp=otp,
            ip_hash=ip_hash,
            user_agent=user_agent,
        )

    def verify_otp(
        self,
        property_obj: IntegrationProperty,
        session_id: UUID,
        otp_code: str,
        *,
        auto_complete: bool = True,
        ip_hash: str = "assisted-capture",
        user_agent: str | None = None,
    ) -> ConsentCaptureSessionRead:
        session = self._get_session(property_obj, session_id)
        if session.status == ConsentCaptureSessionStatus.completed:
            return self._to_read(session, journey=self._journey_for_session(session))

        try:
            OtpService.verify_otp_code(
                submitted=otp_code,
                stored_hash=session.otp_code_hash,
                salt=str(session.id),
                expires_at=session.otp_expires_at,
                attempts=session.otp_attempts or 0,
            )
        except HTTPException:
            session.otp_attempts = (session.otp_attempts or 0) + 1
            if session.otp_attempts >= OTP_MAX_ATTEMPTS:
                session.status = ConsentCaptureSessionStatus.failed
            self.db.commit()
            raise

        session.otp_attempts = (session.otp_attempts or 0) + 1
        session.status = ConsentCaptureSessionStatus.verified
        session.verified_at = datetime.now(timezone.utc)
        session.otp_code_hash = None
        session.otp_verified_token = OtpService.create_verified_token(str(session.id))
        self.db.commit()
        self.db.refresh(session)

        if auto_complete:
            return self.complete_session(property_obj, session.id, ip_hash=ip_hash, user_agent=user_agent)
        return self._to_read(session, journey=self._journey_for_session(session))

    def resend_otp(
        self,
        property_obj: IntegrationProperty,
        session_id: UUID,
        *,
        ip_hash: str = "assisted-capture",
        user_agent: str | None = None,
    ) -> ConsentCaptureSessionRead:
        session = self._get_session(property_obj, session_id)
        if session.status not in (
            ConsentCaptureSessionStatus.otp_pending,
            ConsentCaptureSessionStatus.draft,
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OTP cannot be resent for this session")
        OtpService.can_resend(session.last_otp_sent_at, session.otp_sent_count or 0)
        if not session.mobile_e164:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="No mobile number on session")
        self._issue_otp(session, session.mobile_e164, ip_hash, user_agent)
        self.db.commit()
        self.db.refresh(session)
        return self._to_read(session, journey=self._journey_for_session(session))

    def complete_session(
        self,
        property_obj: IntegrationProperty,
        session_id: UUID,
        *,
        ip_hash: str = "assisted-capture",
        user_agent: str | None = None,
    ) -> ConsentCaptureSessionRead:
        session = self._get_session(property_obj, session_id)
        if session.status == ConsentCaptureSessionStatus.completed and session.consent_receipt_id:
            return self._to_read(session, journey=self._journey_for_session(session))

        if session.status not in (
            ConsentCaptureSessionStatus.verified,
            ConsentCaptureSessionStatus.otp_pending,
        ):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Session is not ready to complete")

        settings = self._org_settings(property_obj.organization_id)
        config = self._require_banking(settings)
        journey = self._journey_cfg(config, session.journey_key)
        otp_required = bool(journey.get("otp_required", False))
        if otp_required and session.status != ConsentCaptureSessionStatus.verified:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="OTP verification required before completion")

        payload = session.payload_json or {}
        identifiers = [
            ConsentIdentifierInput(type=i["type"], token=i["token"])
            for i in payload.get("identifiers", [])
        ]

        result = ConsentCaptureService(self.db).create_receipt(
            property_obj=property_obj,
            session_id=payload.get("session_id", str(session.id)),
            consented_purposes=payload.get("consented_purposes", {}),
            language=payload.get("language", "en"),
            ip_hash=ip_hash,
            user_agent=user_agent or "Vajra-Assisted-Capture",
            principal_email=payload.get("principal_email"),
            principal_phone=payload.get("principal_phone"),
            journey_key=session.journey_key,
            capture_channel=session.capture_channel,
            bank_customer_ref=payload.get("bank_customer_ref"),
            identifiers=identifiers,
            require_banking_validation=True,
            capture_mode=session.capture_mode.value if hasattr(session.capture_mode, "value") else str(session.capture_mode),
        )
        receipt = result.receipt
        receipt.assisted_capture_metadata = session.staff_metadata_json
        if session.client_captured_at:
            receipt.created_at = session.client_captured_at  # preserve offline capture time
        self.db.flush()

        proof_id = self._seal_proof(
            property_obj,
            receipt,
            result.live_version,
            result.capture_channel or session.capture_channel or "branch",
            user_agent,
            offline=session.capture_mode == ConsentCaptureMode.offline,
        )
        receipt.proof_vault_record_id = proof_id

        session.status = ConsentCaptureSessionStatus.completed
        session.completed_at = datetime.now(timezone.utc)
        session.consent_receipt_id = receipt.id
        self.db.commit()
        self.db.refresh(session)
        self.db.refresh(receipt)

        return self._to_read(session, journey=journey, receipt=receipt)

    def sync_offline_batch(
        self,
        property_obj: IntegrationProperty,
        items: list[OfflineSessionSyncItem],
        *,
        ip_hash: str = "offline-sync",
        user_agent: str | None = None,
    ) -> list[OfflineSessionSyncResultItem]:
        results: list[OfflineSessionSyncResultItem] = []
        for item in items:
            try:
                create_body = ConsentCaptureSessionCreate(
                    client_session_id=item.client_session_id,
                    journey_key=item.journey_key,
                    capture_channel=item.capture_channel,
                    capture_mode="offline",
                    session_id=item.session_id,
                    consented_purposes=item.consented_purposes,
                    language=item.language,
                    bank_customer_ref=item.bank_customer_ref,
                    principal_email=item.principal_email,
                    principal_phone=item.principal_phone,
                    identifiers=item.identifiers,
                    staff_metadata=item.staff_metadata,
                    client_captured_at=item.client_captured_at,
                    auto_complete=True,
                )
                read = self.create_session(
                    property_obj,
                    create_body,
                    ip_hash=ip_hash,
                    user_agent=user_agent,
                )
                results.append(
                    OfflineSessionSyncResultItem(
                        client_session_id=item.client_session_id,
                        success=True,
                        session_id=read.id,
                        receipt_id=read.receipt_id,
                    )
                )
            except HTTPException as exc:
                results.append(
                    OfflineSessionSyncResultItem(
                        client_session_id=item.client_session_id,
                        success=False,
                        error=str(exc.detail),
                    )
                )
            except Exception as exc:
                results.append(
                    OfflineSessionSyncResultItem(
                        client_session_id=item.client_session_id,
                        success=False,
                        error=str(exc),
                    )
                )
        return results

    def validate_otp_verified_token(self, token: str, session_id: UUID) -> None:
        OtpService.validate_verified_token(token, str(session_id))

    def _seal_proof(
        self,
        property_obj: IntegrationProperty,
        receipt: ConsentReceipt,
        live_version,
        channel: str,
        user_agent: str | None,
        *,
        offline: bool = False,
    ) -> UUID | None:
        from app.services.assisted_consent_finalize import seal_consent_proof_vault

        try:
            source = f"{'offline_sync' if offline else 'assisted_capture'} {user_agent or ''}".strip()
            return seal_consent_proof_vault(
                self.db,
                organization_id=property_obj.organization_id,
                receipt=receipt,
                live_version=live_version,
                channel=channel,
                source=source,
            )
        except Exception as exc:
            print(f"Failed to seal assisted capture in Proof Vault: {exc}")
            return None

    def _get_session(self, property_obj: IntegrationProperty, session_id: UUID) -> ConsentCaptureSession:
        session = (
            self.db.query(ConsentCaptureSession)
            .filter(
                ConsentCaptureSession.id == session_id,
                ConsentCaptureSession.property_id == property_obj.id,
            )
            .first()
        )
        if session is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Capture session not found")
        return session

    def _journey_for_session(self, session: ConsentCaptureSession) -> dict[str, Any]:
        settings = self._org_settings(session.organization_id)
        config = self._require_banking(settings)
        return self._journey_cfg(config, session.journey_key)

    def _to_read(
        self,
        session: ConsentCaptureSession,
        *,
        journey: dict[str, Any],
        receipt: ConsentReceipt | None = None,
    ) -> ConsentCaptureSessionRead:
        if receipt is None and session.consent_receipt_id:
            receipt = self.db.get(ConsentReceipt, session.consent_receipt_id)
        return ConsentCaptureSessionRead(
            id=session.id,
            client_session_id=session.client_session_id,
            status=session.status.value if hasattr(session.status, "value") else str(session.status),
            journey_key=session.journey_key,
            capture_channel=session.capture_channel,
            capture_mode=session.capture_mode.value if hasattr(session.capture_mode, "value") else str(session.capture_mode),
            otp_required=bool(journey.get("otp_required", False)),
            masked_mobile=self._mask_mobile(session.mobile_e164),
            receipt_id=receipt.id if receipt else session.consent_receipt_id,
            proof_vault_record_id=receipt.proof_vault_record_id if receipt else None,
            principal_id=receipt.principal_id if receipt else None,
            otp_verified_token=session.otp_verified_token,
        )
