"""Public email consent campaign capture — OTP-bound consent decisions."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.consent import ConsentNotice, ConsentNoticeVersion, LegalBasis
from app.models.consent_capture_session import (
    ConsentCaptureMode,
    ConsentCaptureSession,
    ConsentCaptureSessionStatus,
)
from app.models.integration_property import IntegrationProperty
from app.models.notice_delivery import CampaignDelivery, ConsentDecisionStatus, NoticeCampaign
from app.models.organization import Organization
from app.services.consent_capture_service import ConsentCaptureService
from app.services.consent_decision_service import ConsentDecisionService
from app.services.consent_otp_email_service import send_consent_otp_email
from app.services.consent_withdrawal_hooks import process_consent_withdrawal_remediation
from app.services.delivery_token_service import parse_delivery_token
from app.services.otp_service import OTP_MAX_ATTEMPTS, OtpService
from app.services.assisted_consent_finalize import (
    dispatch_bank_consent_webhook,
    log_consent_integration_event,
    proof_webhook_refs,
    seal_consent_proof_vault,
)


def _mask_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


def _mask_phone(phone: str | None) -> str | None:
    if not phone or len(phone) < 4:
        return phone
    return f"{'*' * (len(phone) - 4)}{phone[-4:]}"


class EmailCampaignCaptureService:
    def __init__(self, db: Session):
        self.db = db

    def _load_delivery(self, token: str) -> tuple[CampaignDelivery, NoticeCampaign, IntegrationProperty]:
        parsed = parse_delivery_token(token)
        delivery = self.db.get(CampaignDelivery, UUID(str(parsed["delivery_id"])))
        if not delivery or delivery.delivery_token != token:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consent link not found")
        campaign = self.db.get(NoticeCampaign, delivery.campaign_id)
        if not campaign or campaign.campaign_purpose != "consent_capture":
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Consent campaign not found")
        property_id = campaign.property_id or UUID(str(parsed["property_id"]))
        property_obj = self.db.get(IntegrationProperty, property_id)
        if not property_obj:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
        return delivery, campaign, property_obj

    def get_campaign_page(self, token: str, *, lang: str = "en") -> dict[str, Any]:
        delivery, campaign, property_obj = self._load_delivery(token)
        org = self.db.get(Organization, property_obj.organization_id)
        already_responded = delivery.consent_decision not in (
            ConsentDecisionStatus.pending.value,
            None,
        )

        notice = self.db.get(ConsentNotice, campaign.notice_id)
        live_version = None
        purposes: list[dict[str, Any]] = []
        notice_content: dict[str, Any] = {}

        if notice and (campaign.notice_version_id or notice.current_live_version_id):
            version_id = campaign.notice_version_id or notice.current_live_version_id
            live_version = self.db.get(ConsentNoticeVersion, version_id)
            if live_version:
                translations = live_version.translations or {}
                trans = translations.get(lang) or translations.get("en") or {}
                notice_content = {
                    "title": trans.get("display_name") or live_version.display_name or "Privacy Notice",
                    "description": trans.get("opening_statement") or live_version.opening_statement or "",
                    "dpo_name": live_version.dpo_name or "",
                    "dpo_email": live_version.dpo_email or "",
                    "retention_policy": trans.get("retention_policy") or live_version.retention_policy or "",
                    "rights_exercise": trans.get("rights_exercise") or live_version.rights_exercise or "",
                    "language": lang,
                }
                for p in live_version.purposes:
                    p_trans = (p.translations or {}).get(lang) or (p.translations or {}).get("en") or {}
                    basis = p.legal_basis.value if hasattr(p.legal_basis, "value") else str(p.legal_basis)
                    is_required = basis != LegalBasis.consent.value
                    purposes.append(
                        {
                            "id": str(p.purpose_id),
                            "name": p_trans.get("name") or p.name,
                            "description": p_trans.get("description") or p.description or "",
                            "legal_basis": basis,
                            "is_required": is_required,
                            "default_consented": is_required,
                        }
                    )

        portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/portal/{org.slug}" if org and org.slug else None

        return {
            "already_responded": already_responded,
            "consent_decision": delivery.consent_decision,
            "organization_name": org.name if org else "Organization",
            "organization_slug": org.slug if org else None,
            "masked_email": _mask_email(delivery.recipient_email),
            "masked_phone": _mask_phone(delivery.recipient_phone),
            "recipient_name": delivery.recipient_name,
            "notice": notice_content,
            "purposes": purposes,
            "portal_url": portal_url,
            "notice_version_id": str(live_version.id) if live_version else None,
        }

    def submit_decision(
        self,
        token: str,
        *,
        decision_type: str,
        consented_purposes: dict[str, bool],
        language: str,
        ip_hash: str,
        user_agent: str,
    ) -> dict[str, Any]:
        delivery, campaign, property_obj = self._load_delivery(token)
        if delivery.consent_decision != ConsentDecisionStatus.pending.value:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Consent decision already recorded")

        if not delivery.recipient_email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email required for OTP verification")

        session = self._get_or_create_session(
            delivery=delivery,
            campaign=campaign,
            property_obj=property_obj,
            consented_purposes=consented_purposes,
            decision_type=decision_type,
            language=language,
        )
        delivery.capture_session_id = session.id
        self.db.add(delivery)

        org = self.db.get(Organization, property_obj.organization_id)
        otp = OtpService.generate_otp()
        session.otp_code_hash = OtpService.hash_otp(otp, str(session.id))
        session.otp_expires_at = OtpService.otp_expires_at()
        session.otp_sent_count = (session.otp_sent_count or 0) + 1
        session.last_otp_sent_at = datetime.now(timezone.utc)
        session.status = ConsentCaptureSessionStatus.otp_pending
        self.db.commit()

        send_consent_otp_email(
            self.db,
            organization_id=property_obj.organization_id,
            property_id=property_obj.id,
            session_id=str(session.id),
            to_email=delivery.recipient_email,
            otp=otp,
            org_name=org.name if org else "Organization",
            ip_hash=ip_hash,
            user_agent=user_agent,
        )
        self.db.commit()

        return {
            "status": "otp_sent",
            "masked_email": _mask_email(delivery.recipient_email),
            "session_id": str(session.id),
        }

    def verify_otp_and_finalize(
        self,
        token: str,
        *,
        otp_code: str,
        ip_hash: str,
        user_agent: str,
        background_tasks: BackgroundTasks | None = None,
    ) -> dict[str, Any]:
        delivery, campaign, property_obj = self._load_delivery(token)
        if delivery.consent_decision != ConsentDecisionStatus.pending.value:
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Consent decision already recorded")

        if not delivery.capture_session_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Submit your consent choice first")

        session = self.db.get(ConsentCaptureSession, delivery.capture_session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")

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

        payload = session.payload_json or {}
        consented_purposes = payload.get("consented_purposes") or {}
        decision_type = payload.get("decision_type", "accepted")

        result = ConsentCaptureService(self.db).create_receipt(
            property_obj=property_obj,
            session_id=payload.get("session_id", str(session.id)),
            consented_purposes=consented_purposes,
            language=payload.get("language", "en"),
            ip_hash=ip_hash,
            user_agent=user_agent or "Email-Consent-Campaign",
            principal_email=delivery.recipient_email,
            principal_phone=delivery.recipient_phone,
            journey_key="email_campaign",
            capture_channel="email_campaign",
        )
        receipt = result.receipt
        self.db.flush()

        ConsentDecisionService(self.db).invalidate_cache_for_org(property_obj.organization_id)

        try:
            process_consent_withdrawal_remediation(
                self.db,
                property_obj=property_obj,
                receipt=receipt,
                current_purposes=consented_purposes,
            )
        except Exception:
            pass

        log_consent_integration_event(
            self.db,
            property_id=property_obj.id,
            session_id=str(receipt.session_id),
            ip_hash=ip_hash,
            user_agent=user_agent or "",
            consented_purposes=consented_purposes,
            url=f"/consent-campaign/{token}",
        )

        proof_id = seal_consent_proof_vault(
            self.db,
            organization_id=property_obj.organization_id,
            receipt=receipt,
            live_version=result.live_version,
            channel="email_campaign",
            source="Email consent campaign",
        )
        proof_record_id, proof_hash = proof_webhook_refs(self.db, proof_id or receipt.proof_vault_record_id)

        session.status = ConsentCaptureSessionStatus.completed
        session.completed_at = datetime.now(timezone.utc)
        session.consent_receipt_id = receipt.id

        delivery.consent_decision = self._map_decision_type(decision_type)
        delivery.consent_receipt_id = receipt.id
        self.db.add(delivery)
        self.db.add(session)
        self.db.commit()

        if background_tasks and result.active_banner:
            dispatch_bank_consent_webhook(
                background_tasks,
                db=self.db,
                property_obj=property_obj,
                result=result,
                session_id=str(receipt.session_id),
                consented_purposes=consented_purposes,
                language=payload.get("language", "en"),
                receipt_id=receipt.id,
                proof_vault_record_id=UUID(proof_record_id) if proof_record_id else None,
                proof_hash=proof_hash,
            )

        org = self.db.get(Organization, property_obj.organization_id)
        portal_url = f"{settings.FRONTEND_URL.rstrip('/')}/portal/{org.slug}" if org and org.slug else None

        return {
            "status": "completed",
            "receipt_id": str(receipt.id),
            "consent_decision": delivery.consent_decision,
            "consented_purposes": consented_purposes,
            "portal_url": portal_url,
            "organization_name": org.name if org else "Organization",
        }

    def resend_otp(
        self,
        token: str,
        *,
        ip_hash: str,
        user_agent: str,
    ) -> dict[str, Any]:
        delivery, _campaign, property_obj = self._load_delivery(token)
        if not delivery.capture_session_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Submit your consent choice first")
        session = self.db.get(ConsentCaptureSession, delivery.capture_session_id)
        if not session:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Session not found")
        OtpService.can_resend(session.last_otp_sent_at, session.otp_sent_count or 0)
        if not delivery.recipient_email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Email required")

        org = self.db.get(Organization, property_obj.organization_id)
        otp = OtpService.generate_otp()
        session.otp_code_hash = OtpService.hash_otp(otp, str(session.id))
        session.otp_expires_at = OtpService.otp_expires_at()
        session.otp_sent_count = (session.otp_sent_count or 0) + 1
        session.last_otp_sent_at = datetime.now(timezone.utc)
        session.status = ConsentCaptureSessionStatus.otp_pending
        self.db.commit()

        send_consent_otp_email(
            self.db,
            organization_id=property_obj.organization_id,
            property_id=property_obj.id,
            session_id=str(session.id),
            to_email=delivery.recipient_email,
            otp=otp,
            org_name=org.name if org else "Organization",
            ip_hash=ip_hash,
            user_agent=user_agent,
        )
        self.db.commit()
        return {"status": "otp_sent", "masked_email": _mask_email(delivery.recipient_email)}

    def _get_or_create_session(
        self,
        *,
        delivery: CampaignDelivery,
        campaign: NoticeCampaign,
        property_obj: IntegrationProperty,
        consented_purposes: dict[str, bool],
        decision_type: str,
        language: str,
    ) -> ConsentCaptureSession:
        if delivery.capture_session_id:
            existing = self.db.get(ConsentCaptureSession, delivery.capture_session_id)
            if existing and existing.status != ConsentCaptureSessionStatus.completed:
                existing.payload_json = {
                    "session_id": str(delivery.id),
                    "consented_purposes": consented_purposes,
                    "decision_type": decision_type,
                    "language": language,
                    "principal_email": delivery.recipient_email,
                    "principal_phone": delivery.recipient_phone,
                }
                self.db.add(existing)
                return existing

        session = ConsentCaptureSession(
            organization_id=property_obj.organization_id,
            property_id=property_obj.id,
            client_session_id=f"email-campaign-{delivery.id}",
            journey_key="email_campaign",
            capture_channel="email_campaign",
            status=ConsentCaptureSessionStatus.draft,
            capture_mode=ConsentCaptureMode.online,
            payload_json={
                "session_id": str(delivery.id),
                "consented_purposes": consented_purposes,
                "decision_type": decision_type,
                "language": language,
                "principal_email": delivery.recipient_email,
                "principal_phone": delivery.recipient_phone,
            },
            mobile_e164=delivery.recipient_phone,
        )
        self.db.add(session)
        self.db.flush()
        return session

    @staticmethod
    def _map_decision_type(decision_type: str) -> str:
        mapping = {
            "accept": ConsentDecisionStatus.accepted.value,
            "accepted": ConsentDecisionStatus.accepted.value,
            "reject": ConsentDecisionStatus.rejected.value,
            "rejected": ConsentDecisionStatus.rejected.value,
            "customize": ConsentDecisionStatus.customized.value,
            "customized": ConsentDecisionStatus.customized.value,
        }
        return mapping.get(decision_type, ConsentDecisionStatus.customized.value)
