from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID
from pydantic import BaseModel

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.integration_api_key import IntegrationApiKey
from app.models.integration_event import IntegrationEvent
from app.models.integration_property import IntegrationProperty
from app.models.proof_vault import ProofVaultRecord
from app.models.property_banner_association import PropertyBannerAssociation
from app.schemas.proof_vault import PublicProofVerificationRead
from app.schemas.integration_event import ConfigResponse, EventPayload
from app.schemas.consent_receipt import ConsentReceiptCreate, ConsentReceiptRead
from app.schemas.enforcement import (
    ConsentDecisionRequest,
    ConsentDecisionResponse,
    DecisionTokenMintRequest,
    DecisionTokenResponse,
    DecisionTokenVerifyRequest,
    DecisionTokenVerifyResponse,
    SuppressionCheckRequest,
    SuppressionCheckResponse,
)
from app.schemas.consent_capture_session import (
    ConsentCaptureOtpVerify,
    ConsentCaptureSessionCreate,
    ConsentCaptureSessionRead,
    OfflineSessionSyncRequest,
    OfflineSessionSyncResponse,
)
from app.schemas.consent_banking import ConsentIdentifierInput
from app.models.consent_receipt import ConsentReceipt
from app.services.consent_capture_service import ConsentCaptureService
from app.services.consent_decision_service import ConsentDecisionService
from app.services.consent_decision_token_service import ConsentDecisionTokenService
from app.services.consent_withdrawal_hooks import process_consent_withdrawal_remediation
from app.services.consent_capture_session_service import ConsentCaptureSessionService
from app.services.proof_vault_service import ProofVaultService
from app.services.assisted_consent_finalize import (
    dispatch_bank_consent_webhook,
    log_consent_integration_event,
    proof_webhook_refs,
    record_tag_manager_metrics,
    seal_consent_proof_vault,
)
from app.services.otp_service import OtpService
from app.models.organization_settings import OrganizationSettings
from app.utils.industry_packs import (
    ensure_banking_config,
    is_banking_industry,
    journey_requires_otp,
    resolve_property_journey,
)
from app.services.ab_test_service import (
    VARIANT_COOKIE,
    apply_ab_variant_to_config,
    assign_ab_variant,
    resolve_session_id,
)
from app.services.contracts.banner_contract import BannerConfigContract
from app.services.tag_manager_service import TagManagerService
from app.core.security import verify_password, create_cmp_session_token, decode_cmp_session_token
from app.core.rate_limit import rate_limiter
from app.schemas.cmp_session import TokenExchangeRequest, TokenExchangeResponse
import hashlib
import hmac
import json
import os
from pathlib import Path
from fastapi.responses import FileResponse, Response
from app.core.config import settings

router = APIRouter(prefix="/public/v1/integrations", tags=["integrations_public"])


def validate_origin_against_allowlist(allowed_origins: list[str] | None, req_origin: str | None) -> bool:
    if not allowed_origins or len(allowed_origins) == 0:
        return True
    if not req_origin:
        return True

    clean_req = req_origin.lower().replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
    if clean_req in ("localhost", "127.0.0.1"):
        return True

    for allowed in allowed_origins:
        if not allowed:
            continue
        clean_allowed = allowed.lower().replace("http://", "").replace("https://", "").split("/")[0].split(":")[0]
        if clean_allowed.startswith("*."):
            domain_suffix = clean_allowed[2:]
            if clean_req == domain_suffix or clean_req.endswith("." + domain_suffix):
                return True
        elif clean_req == clean_allowed:
            return True

    return False


def verify_api_key_or_session(
    property_id: UUID,
    request: Request,
    x_api_key: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> IntegrationProperty:
    req_origin = request.headers.get("origin") or request.headers.get("referer")

    # 1. Bearer session token authentication
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
        payload = decode_cmp_session_token(token)
        if not payload or payload.get("sub") != str(property_id):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session token")

        property_obj = db.query(IntegrationProperty).filter(IntegrationProperty.id == property_id).first()
        if not property_obj:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")

        combined_origins = property_obj.allowed_origins or []
        if combined_origins and not validate_origin_against_allowlist(combined_origins, req_origin):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Origin '{req_origin}' is not authorized for this property")

        return property_obj

    # 2. X-API-Key authentication
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API Key or Session Token")

    prefix = x_api_key[:13]
    api_key_obj = db.query(IntegrationApiKey).filter(
        IntegrationApiKey.key_prefix == prefix,
        IntegrationApiKey.property_id == property_id,
        IntegrationApiKey.status == "active",
    ).first()

    is_valid_full_key = bool(api_key_obj and verify_password(x_api_key, api_key_obj.key_hash))
    if not api_key_obj or not is_valid_full_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    combined_origins = (api_key_obj.allowed_origins or []) + (api_key_obj.property.allowed_origins or [])
    if combined_origins and not validate_origin_against_allowlist(combined_origins, req_origin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Origin '{req_origin}' is not authorized for this property")

    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return api_key_obj.property


def verify_api_key(
    property_id: UUID,
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> IntegrationProperty:
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API Key")

    prefix = x_api_key[:13]
    api_key_obj = db.query(IntegrationApiKey).filter(
        IntegrationApiKey.key_prefix == prefix,
        IntegrationApiKey.property_id == property_id,
        IntegrationApiKey.status == "active",
    ).first()

    if not api_key_obj or not verify_password(x_api_key, api_key_obj.key_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return api_key_obj.property


STATE_TO_LANG = {
    "Maharashtra": "mr",
    "Gujarat": "gu",
    "Tamil Nadu": "ta",
    "Karnataka": "kn",
    "Kerala": "ml",
    "Andhra Pradesh": "te",
    "Telangana": "te",
    "West Bengal": "bn",
    "Odisha": "or",
    "Punjab": "pa",
    "Assam": "as",
    "Bihar": "hi",
    "Uttar Pradesh": "hi",
    "Madhya Pradesh": "hi",
    "Rajasthan": "hi",
    "Haryana": "hi",
    "Himachal Pradesh": "hi",
    "Delhi": "hi",
    "Jammu and Kashmir": "ks",
    "Goa": "kok",
    "Manipur": "mni",
    "Sikkim": "ne",
}

INDIAN_LANG_CODES = {
    "as", "bn", "brx", "doi", "gu", "hi", "kn", "ks", "kok", "mai",
    "ml", "mni", "mr", "ne", "or", "pa", "sa", "sat", "sd", "ta", "te", "ur"
}


def detect_lang_from_geoip(request: Request) -> str:
    # 1. Custom testing parameter or header
    test_state = request.query_params.get("test_state") or request.headers.get("X-Test-State")
    if test_state and test_state in STATE_TO_LANG:
        return STATE_TO_LANG[test_state]

    # 2. Check X-Forwarded-For or client host
    client_ip = request.client.host if request.client else "127.0.0.1"
    x_forwarded_for = request.headers.get("x-forwarded-for")
    if x_forwarded_for:
        client_ip = x_forwarded_for.split(",")[0].strip()

    # Mock IP-to-state mapping for testing/demo
    if client_ip.startswith("103.21."):  # Example TN IP range
        return "ta"
    elif client_ip.startswith("106.198."):  # Example MH IP range
        return "mr"
    elif client_ip.startswith("117.200."):  # Example KA IP range
        return "kn"
    elif client_ip.startswith("157.45."):  # Example GJ IP range
        return "gu"
    
    # Default fallback
    return "hi"


@router.post("/{property_id}/token", response_model=TokenExchangeResponse)
def exchange_cmp_session_token(
    property_id: UUID,
    payload: TokenExchangeRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> TokenExchangeResponse:
    rate_limiter.check_rate_limit(request, "token_exchange", max_requests=30, window_seconds=60)

    req_origin = payload.origin or request.headers.get("origin") or request.headers.get("referer") or ""

    prefix = payload.api_key[:13]
    api_key_obj = db.query(IntegrationApiKey).filter(
        IntegrationApiKey.key_prefix == prefix,
        IntegrationApiKey.property_id == property_id,
        IntegrationApiKey.status == "active",
    ).first()

    if not api_key_obj or not verify_password(payload.api_key, api_key_obj.key_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")

    combined_origins = (api_key_obj.allowed_origins or []) + (api_key_obj.property.allowed_origins or [])
    if combined_origins and not validate_origin_against_allowlist(combined_origins, req_origin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail=f"Origin '{req_origin}' is not authorized for this property")

    session_token = create_cmp_session_token(property_id=property_id, origin=req_origin, ttl_minutes=30)

    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return TokenExchangeResponse(
        session_token=session_token,
        token_type="Bearer",
        expires_in=1800,
        property_id=str(property_id),
    )


@router.get("/{property_id}/config", response_model=ConfigResponse)
def get_cmp_config(
    property_id: UUID,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    lang: str | None = Query(default=None),
    journey: str | None = Query(default=None),
) -> ConfigResponse:
    rate_limiter.check_rate_limit(request, "config_fetch", max_requests=60, window_seconds=60)

    org_settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == property_obj.organization_id)
        .first()
    )
    banking_config = ensure_banking_config(
        org_settings.primary_industry if org_settings else None,
        org_settings.consent_industry_config if org_settings else None,
    )
    banking_org = is_banking_industry(org_settings.primary_industry if org_settings else None)
    default_org_lang = org_settings.default_consent_language if org_settings else None
    
    # 1. Get active banner association
    active_assoc = db.query(PropertyBannerAssociation).filter(
        PropertyBannerAssociation.property_id == property_id,
        PropertyBannerAssociation.status == "active"
    ).first()
    
    if not active_assoc:
        # Send fallback config if no banner is attached
        return ConfigResponse(
            property_id=str(property_id),
            banner=None,
            purposes=[],
            translations={},
            blocker_mode=property_obj.blocker_mode
        )
        
    banner_id = active_assoc.banner_id
    from app.models.consent_banner import ConsentBanner
    banner = db.query(ConsentBanner).filter(ConsentBanner.id == banner_id).first()
    
    # Resolve language: query param → cookie → Accept-Language → org default → banking hi fallback
    resolved_lang = lang or "en"
    if banner:
        settings_val = banner.language_detection_settings or {"browser": True, "geoip": True, "user_choice": True}
        if isinstance(settings_val, str):
            try:
                settings_val = json.loads(settings_val)
            except Exception:
                settings_val = {"browser": True, "geoip": True, "user_choice": True}

        if lang:
            resolved_lang = lang
        else:
            cookie_lang = None
            if settings_val.get("user_choice"):
                cookie_lang = request.cookies.get("dpdpa_consent_lang")
                if cookie_lang:
                    resolved_lang = cookie_lang

            if not lang and not cookie_lang:
                browser_resolved = None
                if settings_val.get("browser"):
                    accept_lang = request.headers.get("accept-language")
                    if accept_lang:
                        for part in accept_lang.split(","):
                            locale = part.split(";")[0].strip().split("-")[0].lower()
                            if locale in INDIAN_LANG_CODES:
                                browser_resolved = locale
                                break
                if browser_resolved:
                    resolved_lang = browser_resolved
                elif settings_val.get("geoip"):
                    resolved_lang = detect_lang_from_geoip(request)
                elif default_org_lang:
                    resolved_lang = default_org_lang
                elif banking_org:
                    resolved_lang = "hi"

    # 2. Resolve notice purposes and translations
    notice_purposes = []
    notice_translations = {}
    
    notice_id = property_obj.consent_notice_id or (banner.consent_notice_id if banner else None)
    if notice_id:
        from app.models.consent import ConsentNotice, ConsentNoticeVersion, LegalBasis
        notice = db.get(ConsentNotice, notice_id)
        if notice and notice.current_live_version_id:
            live_version = db.get(ConsentNoticeVersion, notice.current_live_version_id)
            if live_version:
                for p in live_version.purposes:
                    p_name = p.name
                    p_desc = p.description or ""
                    if p.translations and resolved_lang in p.translations:
                        p_name = p.translations[resolved_lang].get("name") or p.name
                        p_desc = p.translations[resolved_lang].get("description") or p.description or ""
                    
                    notice_purposes.append({
                        "id": str(p.purpose_id),
                        "version_id": str(p.id),
                        "name": p_name,
                        "legal_basis": p.legal_basis.value if hasattr(p.legal_basis, "value") else str(p.legal_basis),
                        "data_categories": p.data_categories or [],
                        "retention_period": p.retention_period or "",
                        "description": p_desc,
                        "is_special_category": p.is_special_category,
                        "is_essential": p.legal_basis == LegalBasis.legitimate_use,
                        "has_right_to_object": p.legal_basis == LegalBasis.legitimate_use,
                        "objection_url": f"{settings.FRONTEND_URL}/rights/portal?right=objection&purpose_id={p.purpose_id}"
                    })
                # If banner translations exist for resolved_lang, we want to prioritize them
                # so the pre-translated Eighth Schedule strings render instead of the hardcoded notice fallback.
                banner_trans = BannerConfigContract.get_banner_translations(db, banner_id, resolved_lang)
                
                notice_trans_override = {}
                translations_dict = live_version.translations or {}
                if live_version.translations and resolved_lang in live_version.translations:
                    notice_trans_override = live_version.translations[resolved_lang] or {}
                    translations_dict = notice_trans_override
                else:
                    notice_trans_override = translations_dict
                
                notice_translations = {
                    "title": banner_trans.get("title") or notice_trans_override.get("display_name") or live_version.display_name or "Your Privacy",
                    "description": banner_trans.get("description") or notice_trans_override.get("opening_statement") or live_version.opening_statement or "We use cookies to improve your experience.",
                    "accept_text": banner_trans.get("accept_text") or "Accept",
                    "reject_text": banner_trans.get("reject_text") or "Reject All",
                    "dpo_name": live_version.dpo_name or "",
                    "dpo_email": live_version.dpo_email or "",
                    "retention_policy": notice_trans_override.get("retention_policy") or live_version.retention_policy or "",
                    "complaint_process": notice_trans_override.get("complaint_process") or live_version.complaint_process or "",
                    "rights_exercise": notice_trans_override.get("rights_exercise") or live_version.rights_exercise or "",
                    "dpbi_escalation_text": translations_dict.get("dpbiEscalationText") or "",
                    "consent_withdrawal_method": translations_dict.get("consentWithdrawalMethod") or "",
                    "data_categories_text": translations_dict.get("dataCategories") or "",
                    "resolved_lang": resolved_lang
                }

    # Fetch full config from Banner module
    banner_config = BannerConfigContract.get_banner_config(db, banner_id)
    if banner_config:
        from app.services.consent_portal_email_service import build_org_portal_url
        portal_url = build_org_portal_url(db, property_obj.organization_id)
        banner_config["portal_url"] = portal_url
        banner_config["withdrawal_url"] = f"{portal_url}?right=withdraw" if portal_url else None

        journey_key, channel, journey_label = resolve_property_journey(
            banking_config,
            str(property_id),
            journey_override=journey,
        )
        if channel:
            banner_config["channel"] = channel
        if journey_key:
            banner_config["journey_key"] = journey_key
        if journey_label:
            banner_config["journey_label"] = journey_label

        if banner:
            client_ip = request.client.host if request.client else "unknown"
            session_id = resolve_session_id(request, f"{client_ip}-{property_id}")
            sticky = request.cookies.get(VARIANT_COOKIE)
            variant, is_new, concluded = assign_ab_variant(
                session_id=session_id,
                banner_id=str(banner_id),
                banner=banner,
                sticky_cookie=sticky,
            )
            banner_config = apply_ab_variant_to_config(banner_config, banner, variant)
            response.set_cookie(
                VARIANT_COOKIE,
                variant,
                max_age=60 * 60 * 24 * 30,
                httponly=False,
                samesite="lax",
            )
            try:
                event_type = "ab_test_concluded" if concluded else "ab_variant_assigned"
                if is_new or concluded:
                    ip_hash = hashlib.sha256(
                        f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()
                    ).hexdigest()
                    db.add(
                        IntegrationEvent(
                            property_id=property_obj.id,
                            event_type=event_type,
                            session_id=session_id,
                            ip_hash=ip_hash,
                            user_agent=request.headers.get("user-agent", "")[:1024],
                            url=str(request.url),
                            payload={
                                "banner_id": str(banner_id),
                                "variant": variant,
                            },
                            created_at=datetime.now(timezone.utc),
                        )
                    )
                    db.commit()
            except Exception as e:
                print(f"Failed to log A/B event: {e}")

    if notice_purposes:
        purposes = notice_purposes
        translations = notice_translations
    else:
        purposes = BannerConfigContract.get_banner_purposes(db, banner_id)
        raw_trans = BannerConfigContract.get_banner_translations(db, banner_id, resolved_lang)
        translations = {
            "title": raw_trans.get("title") or banner.heading or "We value your privacy",
            "description": raw_trans.get("description") or banner.body_text or "We use cookies to enhance your experience.",
            "accept_text": raw_trans.get("accept_text") or banner.cta_accept or "Accept",
            "reject_text": raw_trans.get("reject_text") or banner.cta_reject or "Reject All",
            "customize_text": raw_trans.get("customize_text") or banner.cta_customize or "Customize",
        }

    if isinstance(translations, dict):
        translations["resolved_lang"] = resolved_lang
        if banner_config:
            translations["customize_text"] = (
                translations.get("customize_text")
                or banner_config.get("manage_preferences_text")
                or (banner.cta_customize if banner else "Customize")
            )
            if banner_config.get("withdraw_text"):
                translations["withdraw_text"] = banner_config["withdraw_text"]
    
    # 3. Get blocking rules
    from app.services.tracker_service import TrackerService
    blocking_rules = TrackerService(db).get_blocking_rules(property_id)

    # Record dynamic page load event in IntegrationEvent
    try:
        from app.models.integration_event import IntegrationEvent
        client_ip = request.client.host if request.client else "unknown"
        ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
        user_agent = request.headers.get("user-agent", "")[:1024]
        
        event = IntegrationEvent(
            property_id=property_obj.id,
            event_type="cmp_loaded",
            session_id=None,
            ip_hash=ip_hash,
            user_agent=user_agent,
            url=str(request.url),
            payload={"banner_id": str(banner_id)} if banner_id else {},
            created_at=datetime.now(timezone.utc),
        )
        db.add(event)
        db.commit()
    except Exception as e:
        print(f"Failed to log cmp_loaded event: {e}")

    from app.services.consent_portal_email_service import get_public_banner_email_config

    consent_email_enabled = True
    _, consent_email_label = get_public_banner_email_config(
        db, property_obj.organization_id
    )
    if not consent_email_label:
        consent_email_label = "Email a copy of my consent preferences"

    return ConfigResponse(
        property_id=str(property_id),
        banner=banner_config,
        purposes=purposes,
        translations=translations,
        blocker_mode=property_obj.blocker_mode,
        blocking_rules=blocking_rules,
        consent_portal_email_enabled=consent_email_enabled,
        consent_portal_email_label=consent_email_label,
    )


@router.post("/{property_id}/events", status_code=status.HTTP_202_ACCEPTED)
def record_event(
    property_id: UUID,
    payload: EventPayload,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
) -> dict:
    rate_limiter.check_rate_limit(request, "event_post", max_requests=120, window_seconds=60)
    
    # Very basic IP hashing for privacy
    client_ip = request.client.host if request.client else "unknown"
    from app.utils.privacy_hash import pseudonymize_ip

    ip_hash = pseudonymize_ip(client_ip)
    
    event = IntegrationEvent(
        property_id=property_obj.id,
        event_type=payload.event_type,
        session_id=payload.session_id,
        ip_hash=ip_hash,
        user_agent=request.headers.get("user-agent", "")[:1024],
        url=payload.url,
        payload=payload.payload,
        created_at=datetime.now(timezone.utc),
    )
    
    db.add(event)
    db.commit()
    
    return {"status": "recorded"}

@router.post("/{property_id}/consent", response_model=ConsentReceiptRead, status_code=status.HTTP_201_CREATED)
def save_consent_receipt(
    property_id: UUID,
    payload: ConsentReceiptCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
) -> ConsentReceiptRead:
    rate_limiter.check_rate_limit(request, "consent_post", max_requests=120, window_seconds=60)

    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "")[:1024]

    capture_svc = ConsentCaptureService(db)
    result = capture_svc.create_receipt(
        property_obj=property_obj,
        session_id=payload.session_id,
        consented_purposes=payload.consented_purposes,
        language=payload.language,
        ip_hash=ip_hash,
        user_agent=user_agent,
        principal_email=str(payload.principal_email) if payload.principal_email else None,
        principal_phone=str(payload.principal_phone) if payload.principal_phone else None,
        journey_key=payload.journey_key,
        capture_channel=payload.capture_channel,
        bank_customer_ref=payload.bank_customer_ref,
        identifiers=payload.identifiers,
    )
    receipt = result.receipt
    active_banner = result.active_banner
    banner_id = result.banner_id
    live_version = result.live_version
    channel_label = result.capture_channel or "web"

    db.commit()
    db.refresh(receipt)

    ConsentDecisionService(db).invalidate_cache_for_org(property_obj.organization_id)

    try:
        process_consent_withdrawal_remediation(
            db,
            property_obj=property_obj,
            receipt=receipt,
            current_purposes=payload.consented_purposes,
        )
    except Exception as e:
        print(f"Withdrawal remediation hook failed: {e}")

    # Record consent event in IntegrationEvent for aggregation
    try:
        from app.models.integration_event import IntegrationEvent
        purposes = payload.consented_purposes or {}
        non_essential = [k for k, v in purposes.items() if k != "necessary"]
        if not non_essential:
            event_type = "consent_given"
        else:
            all_accepted = all(purposes.get(k, False) for k in non_essential)
            all_rejected = all(not purposes.get(k, False) for k in non_essential)
            if all_accepted:
                event_type = "consent_given"
            elif all_rejected:
                event_type = "consent_denied"
            else:
                event_type = "consent_partial"

        event = IntegrationEvent(
            property_id=property_obj.id,
            event_type=event_type,
            session_id=payload.session_id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            url=str(request.url),
            payload={"banner_id": str(banner_id)} if banner_id else {},
            created_at=datetime.now(timezone.utc),
        )
        db.add(event)
        db.commit()
    except Exception as e:
        print(f"Failed to log consent event: {e}")
    
    try:
        proof_id = seal_consent_proof_vault(
            db,
            organization_id=property_obj.organization_id,
            receipt=receipt,
            live_version=live_version,
            channel=channel_label,
            source=f"IP {client_ip}",
        )
        db.commit()
        proof_record_id, proof_hash = proof_webhook_refs(db, proof_id or receipt.proof_vault_record_id)
    except Exception as e:
        print(f"Failed to seal consent receipt in Proof Vault: {e}")
        proof_record_id, proof_hash = None, None

    try:
        TagManagerService(db).record_consent_enforcement(property_id, payload.consented_purposes)
    except Exception as e:
        print(f"Failed to record tag manager metrics: {e}")

    if active_banner and active_banner.consent_webhook_url:
        from app.core.database import SessionLocal
        from app.services.consent_webhook_service import deliver_consent_webhook

        webhook_url = active_banner.consent_webhook_url
        org_id = property_obj.organization_id
        receipt_id = str(receipt.id)
        session_id = payload.session_id
        consented = payload.consented_purposes
        language = payload.language
        principal_email = receipt.principal_email
        banking_metadata = result.banking_metadata
        wh_proof_id = proof_record_id
        wh_proof_hash = proof_hash

        def _dispatch_webhook() -> None:
            bg_db = SessionLocal()
            try:
                deliver_consent_webhook(
                    bg_db,
                    webhook_url=webhook_url,
                    property_id=property_id,
                    organization_id=org_id,
                    banner_id=str(banner_id) if banner_id else None,
                    session_id=session_id,
                    consented_purposes=consented,
                    language=language,
                    receipt_id=receipt_id,
                    is_test=False,
                    principal_email=principal_email,
                    banking_metadata=banking_metadata,
                    proof_vault_record_id=wh_proof_id,
                    proof_hash=wh_proof_hash,
                    signing_secret=active_banner.webhook_signing_secret,
                    subscribed_events=active_banner.webhook_subscribed_events,
                    bearer_token=active_banner.webhook_bearer_token,
                )
            finally:
                bg_db.close()

        background_tasks.add_task(_dispatch_webhook)

    if payload.principal_email:
        from app.core.database import SessionLocal
        from app.services.consent_portal_email_service import dispatch_consent_portal_email

        principal_email = str(payload.principal_email)
        org_id = property_obj.organization_id
        receipt_id = receipt.id
        session_id = payload.session_id
        consented = payload.consented_purposes

        def _dispatch_portal_email() -> None:
            bg_db = SessionLocal()
            try:
                dispatch_consent_portal_email(
                    bg_db,
                    property_id=property_id,
                    organization_id=org_id,
                    receipt_id=receipt_id,
                    session_id=session_id,
                    principal_email=principal_email,
                    consented_purposes=consented,
                    ip_hash=ip_hash,
                    user_agent=user_agent,
                )
            finally:
                bg_db.close()

        background_tasks.add_task(_dispatch_portal_email)

    if payload.principal_phone:
        from app.core.database import SessionLocal
        from app.services.consent_portal_sms_service import dispatch_consent_portal_sms

        principal_phone = str(payload.principal_phone)
        org_id = property_obj.organization_id
        receipt_id = receipt.id
        session_id = payload.session_id
        consented = payload.consented_purposes

        banner_links = {
            "privacy_policy_url": active_banner.privacy_policy_url if active_banner else None,
            "cookie_policy_url": active_banner.cookie_policy_url if active_banner else None,
            "dpo_email": active_banner.dpo_email if active_banner else None,
        }

        def _dispatch_portal_sms() -> None:
            bg_db = SessionLocal()
            try:
                dispatch_consent_portal_sms(
                    bg_db,
                    property_id=property_id,
                    organization_id=org_id,
                    receipt_id=receipt_id,
                    session_id=session_id,
                    principal_phone=principal_phone,
                    consented_purposes=consented,
                    ip_hash=ip_hash,
                    user_agent=user_agent,
                    banner_links=banner_links,
                )
            finally:
                bg_db.close()

        background_tasks.add_task(_dispatch_portal_sms)
    
    receipt_out = ConsentReceiptRead.model_validate(receipt)
    token_result = ConsentDecisionTokenService(db).mint_for_receipt(
        property_obj=property_obj,
        receipt=receipt,
        principal_email=str(payload.principal_email) if payload.principal_email else None,
        principal_phone=str(payload.principal_phone) if payload.principal_phone else None,
        session_id=payload.session_id,
    )
    if token_result:
        receipt_out = receipt_out.model_copy(
            update={
                "decision_token": token_result.decision_token,
                "decision_token_expires_in": token_result.decision_token_expires_in,
            }
        )
    return receipt_out


@router.post(
    "/{property_id}/consent/decision",
    response_model=ConsentDecisionResponse,
)
def evaluate_consent_decision(
    property_id: UUID,
    payload: ConsentDecisionRequest,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
    x_zs_decision_token: Annotated[str | None, Header(alias="X-ZS-Decision-Token")] = None,
) -> ConsentDecisionResponse:
    """Server-side consent decision for first-party data writes (Decision API)."""
    rate_limiter.check_rate_limit(request, "consent_decision", max_requests=600, window_seconds=60)
    if property_obj.id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    return ConsentDecisionService(db).evaluate(
        property_obj=property_obj,
        payload=payload,
        decision_token_header=x_zs_decision_token,
    )


@router.get(
    "/{property_id}/consent/decision-token",
    response_model=DecisionTokenResponse,
)
def get_consent_decision_token(
    property_id: UUID,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
    principal_email: Annotated[str | None, Query()] = None,
    principal_phone: Annotated[str | None, Query()] = None,
    session_id: Annotated[str | None, Query()] = None,
) -> DecisionTokenResponse:
    """Mint a bundle decision token for local verification (steady-state hot path)."""
    rate_limiter.check_rate_limit(request, "consent_decision_token", max_requests=300, window_seconds=60)
    if property_obj.id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    payload = DecisionTokenMintRequest(
        principal_email=principal_email,
        principal_phone=principal_phone,
        session_id=session_id,
    )
    return ConsentDecisionTokenService(db).mint(property_obj=property_obj, payload=payload)


@router.post(
    "/{property_id}/consent/decision/verify",
    response_model=DecisionTokenVerifyResponse,
)
def verify_consent_decision_token(
    property_id: UUID,
    payload: DecisionTokenVerifyRequest,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
) -> DecisionTokenVerifyResponse:
    """Verify a decision token server-side (for backends without the signing secret)."""
    rate_limiter.check_rate_limit(request, "consent_decision_verify", max_requests=600, window_seconds=60)
    if property_obj.id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    return ConsentDecisionTokenService(db).verify(property_obj=property_obj, payload=payload)


@router.post(
    "/{property_id}/consent/suppression-check",
    response_model=SuppressionCheckResponse,
)
def suppression_check(
    property_id: UUID,
    payload: SuppressionCheckRequest,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key_or_session)],
    db: Session = Depends(get_db),
) -> SuppressionCheckResponse:
    """Bulk allowed/denied check before marketing sends (filter suppressed principals)."""
    rate_limiter.check_rate_limit(request, "consent_suppression_check", max_requests=120, window_seconds=60)
    if property_obj.id != property_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    return ConsentDecisionService(db).evaluate_suppression_batch(
        property_obj=property_obj,
        payload=payload,
    )


def _banking_config_for_property(db: Session, property_obj: IntegrationProperty) -> dict | None:
    settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == property_obj.organization_id)
        .first()
    )
    if not settings or not is_banking_industry(settings.primary_industry):
        return None
    return ensure_banking_config(settings.primary_industry, settings.consent_industry_config)


@router.post(
    "/{property_id}/bank/consent/sessions",
    response_model=ConsentCaptureSessionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_bank_consent_session(
    property_id: UUID,
    payload: ConsentCaptureSessionCreate,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> ConsentCaptureSessionRead:
    rate_limiter.check_rate_limit(request, "bank_consent_session", max_requests=120, window_seconds=60)
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
    return ConsentCaptureSessionService(db).create_session(
        property_obj, payload, ip_hash=ip_hash, user_agent=user_agent
    )


@router.post("/{property_id}/bank/consent/sessions/{session_id}/verify-otp", response_model=ConsentCaptureSessionRead)
def verify_bank_consent_otp(
    property_id: UUID,
    session_id: UUID,
    payload: ConsentCaptureOtpVerify,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> ConsentCaptureSessionRead:
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
    return ConsentCaptureSessionService(db).verify_otp(
        property_obj,
        session_id,
        payload.otp_code,
        auto_complete=payload.auto_complete,
        ip_hash=ip_hash,
        user_agent=user_agent,
    )


@router.post("/{property_id}/bank/consent/sessions/{session_id}/resend-otp", response_model=ConsentCaptureSessionRead)
def resend_bank_consent_otp(
    property_id: UUID,
    session_id: UUID,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> ConsentCaptureSessionRead:
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
    return ConsentCaptureSessionService(db).resend_otp(
        property_obj, session_id, ip_hash=ip_hash, user_agent=user_agent
    )


@router.post("/{property_id}/bank/consent/sessions/{session_id}/complete", response_model=ConsentCaptureSessionRead)
def complete_bank_consent_session(
    property_id: UUID,
    session_id: UUID,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> ConsentCaptureSessionRead:
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
    return ConsentCaptureSessionService(db).complete_session(
        property_obj, session_id, ip_hash=ip_hash, user_agent=user_agent
    )


@router.post("/{property_id}/bank/consent/sessions/sync", response_model=OfflineSessionSyncResponse)
def sync_offline_bank_consent_sessions(
    property_id: UUID,
    payload: OfflineSessionSyncRequest,
    request: Request,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> OfflineSessionSyncResponse:
    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
    results = ConsentCaptureSessionService(db).sync_offline_batch(
        property_obj, payload.sessions, ip_hash=ip_hash, user_agent=user_agent
    )
    return OfflineSessionSyncResponse(results=results)


@router.post("/{property_id}/bank/consent", response_model=ConsentReceiptRead, status_code=status.HTTP_201_CREATED)
def save_bank_consent_receipt(
    property_id: UUID,
    payload: ConsentReceiptCreate,
    request: Request,
    background_tasks: BackgroundTasks,
    property_obj: Annotated[IntegrationProperty, Depends(verify_api_key)],
    db: Session = Depends(get_db),
) -> ConsentReceiptRead:
    """Server-to-server consent capture for branch, merchant, and core-banking integrations."""
    rate_limiter.check_rate_limit(request, "bank_consent_post", max_requests=120, window_seconds=60)
    if not payload.journey_key:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="journey_key is required for bank consent capture")

    config = _banking_config_for_property(db, property_obj)
    if config and journey_requires_otp(config, payload.journey_key):
        if payload.otp_verified_token:
            token_session_id = UUID(OtpService.parse_verified_token_session_id(payload.otp_verified_token))
            OtpService.validate_verified_token(payload.otp_verified_token, str(token_session_id))
            client_ip = request.client.host if request.client else "unknown"
            ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
            user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]
            session_read = ConsentCaptureSessionService(db).complete_session(
                property_obj, token_session_id, ip_hash=ip_hash, user_agent=user_agent
            )
            receipt = db.get(ConsentReceipt, session_read.receipt_id)
            return ConsentReceiptRead.model_validate(receipt)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="OTP verification required. Use POST /bank/consent/sessions or provide otp_verified_token",
        )

    client_ip = request.client.host if request.client else "unknown"
    ip_hash = hashlib.sha256(f"{client_ip}-{datetime.now(timezone.utc).date()}".encode()).hexdigest()
    user_agent = request.headers.get("user-agent", "Vajra-Bank-API")[:1024]

    result = ConsentCaptureService(db).create_receipt(
        property_obj=property_obj,
        session_id=payload.session_id,
        consented_purposes=payload.consented_purposes,
        language=payload.language,
        ip_hash=ip_hash,
        user_agent=user_agent,
        principal_email=str(payload.principal_email) if payload.principal_email else None,
        principal_phone=str(payload.principal_phone) if payload.principal_phone else None,
        journey_key=payload.journey_key,
        capture_channel=payload.capture_channel,
        bank_customer_ref=payload.bank_customer_ref,
        identifiers=payload.identifiers,
        require_banking_validation=True,
    )
    receipt = result.receipt
    channel_label = result.capture_channel or payload.capture_channel or "api"
    db.commit()
    db.refresh(receipt)

    try:
        log_consent_integration_event(
            db,
            property_id=property_obj.id,
            session_id=payload.session_id,
            ip_hash=ip_hash,
            user_agent=user_agent,
            consented_purposes=payload.consented_purposes,
            url=str(request.url),
        )
        proof_id = seal_consent_proof_vault(
            db,
            organization_id=property_obj.organization_id,
            receipt=receipt,
            live_version=result.live_version,
            channel=channel_label,
            source=f"Bank API {client_ip}",
        )
        db.commit()
        proof_record_id, proof_hash = proof_webhook_refs(db, proof_id or receipt.proof_vault_record_id)
    except Exception as e:
        print(f"Failed to finalize bank consent: {e}")
        proof_record_id, proof_hash = None, None

    record_tag_manager_metrics(db, property_id, payload.consented_purposes)
    dispatch_bank_consent_webhook(
        background_tasks,
        db=db,
        property_obj=property_obj,
        result=result,
        session_id=payload.session_id,
        consented_purposes=payload.consented_purposes,
        language=payload.language,
        receipt_id=receipt.id,
        proof_vault_record_id=UUID(proof_record_id) if proof_record_id else None,
        proof_hash=proof_hash,
    )

    return ConsentReceiptRead.model_validate(receipt)


@router.get("/cmp.js")
def serve_cmp_js():
    public_dir = Path(__file__).resolve().parents[3] / "frontend" / "public"
    min_path = public_dir / "cmp.min.js"
    source_path = public_dir / "cmp.js"
    manifest_path = public_dir / "cmp.manifest.json"

    target_path = min_path if min_path.exists() else source_path
    if not target_path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="SDK bundle not found")

    headers = {
        "Cache-Control": "public, max-age=86400, immutable",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
    }

    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                if manifest.get("content_hash"):
                    headers["ETag"] = f'"{manifest["content_hash"]}"'
                if manifest.get("sri_hash"):
                    headers["X-SDK-SRI"] = manifest["sri_hash"]
        except Exception:
            pass

    return FileResponse(str(target_path), media_type="application/javascript", headers=headers)


# --- Mobile SDK public endpoints ---

from app.schemas.property_deployment import DeploymentHeartbeatCreate


@router.get("/sdk/config/{deployment_id}")
def get_sdk_config(
    deployment_id: UUID,
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
    lang: str | None = Query(default=None),
    journey: str | None = Query(default=None),
):
    from app.services.property_deployment_service import DeploymentService
    from app.models.property_banner_association import PropertyBannerAssociation
    from app.models.consent_banner import ConsentBanner
    from app.models.consent import ConsentNotice, ConsentNoticeVersion
    
    dep = DeploymentService(db).get_deployment(deployment_id)
    
    # Authenticate via verify_api_key helper
    verify_api_key(dep.property_id, x_api_key, db)
    
    prop = dep.property
    
    # Resolve active banner
    active_assoc = db.query(PropertyBannerAssociation).filter(
        PropertyBannerAssociation.property_id == prop.id,
        PropertyBannerAssociation.status == "active"
    ).first()
    
    banner_data = {}
    if active_assoc:
        banner = db.query(ConsentBanner).filter(ConsentBanner.id == active_assoc.banner_id).first()
        if banner:
            banner_data = {
                "id": str(banner.id),
                "name": banner.name,
                "version": banner.version,
                "display_style": banner.display_style,
                "position": banner.position,
                "theme": banner.theme,
                "heading": banner.heading,
                "body_text": banner.body_text,
                "cta_accept": banner.cta_accept,
                "cta_reject": banner.cta_reject,
                "cta_customize": banner.cta_customize,
                "translations": banner.translations or {},
            }
            
    # Resolve purposes from active consent notice
    purposes = []
    notice_id = prop.consent_notice_id or (banner.consent_notice_id if active_assoc and banner else None)
    if notice_id:
        notice = db.query(ConsentNotice).filter(ConsentNotice.id == notice_id).first()
        if notice and notice.current_live_version_id:
            live_ver = db.query(ConsentNoticeVersion).filter(ConsentNoticeVersion.id == notice.current_live_version_id).first()
            if live_ver and live_ver.purposes:
                for p in live_ver.purposes:
                    purposes.append({
                        "id": str(p.purpose_id),
                        "code": p.name.lower().replace(" ", "_"),
                        "name": p.name,
                        "description": p.description or "",
                    })
                    
    # Active version settings
    version_settings = {}
    if dep.active_version:
        version_settings = dep.active_version.settings or {}

    banking_config = _banking_config_for_property(db, prop)
    journey_key, channel, journey_label = resolve_property_journey(
        banking_config,
        str(prop.id),
        journey_override=journey,
    )
    resolved_lang = lang or prop.default_language or "en"
        
    return {
        "deployment_id": str(dep.id),
        "property_id": str(prop.id),
        "platform": dep.platform,
        "identifier": dep.identifier,
        "status": dep.status,
        "blocker_mode": prop.blocker_mode,
        "default_language": prop.default_language,
        "resolved_lang": resolved_lang,
        "journey_key": journey_key,
        "channel": channel,
        "journey_label": journey_label,
        "settings": version_settings,
        "banner": banner_data,
        "purposes": purposes,
    }


@router.post("/sdk/heartbeat/{deployment_id}")
def sdk_heartbeat(
    deployment_id: UUID,
    body: DeploymentHeartbeatCreate,
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    from app.services.property_deployment_service import DeploymentService
    
    dep = DeploymentService(db).get_deployment(deployment_id)
    verify_api_key(dep.property_id, x_api_key, db)
    
    heartbeat = DeploymentService(db).record_heartbeat(deployment_id, body)
    return {"status": "success", "received_at": heartbeat.received_at}


class MobileConsentPayload(BaseModel):
    property_id: UUID
    deployment_id: UUID
    session_id: str
    consented_purposes: list[str]
    language: str
    device_info: str | None = None
    journey_key: str | None = None
    capture_channel: str | None = None
    bank_customer_ref: str | None = None
    principal_email: str | None = None
    principal_phone: str | None = None
    identifiers: list[ConsentIdentifierInput] | None = None


@router.post("/sdk/consent")
def sdk_consent(
    body: MobileConsentPayload,
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    from app.models.integration_event import IntegrationEvent

    property_obj = verify_api_key(body.property_id, x_api_key, db)

    result = ConsentCaptureService(db).create_receipt(
        property_obj=property_obj,
        session_id=body.session_id,
        consented_purposes=body.consented_purposes,
        language=body.language,
        ip_hash="mobile-sdk",
        user_agent=body.device_info or "Vajra Mobile SDK",
        principal_email=body.principal_email,
        principal_phone=body.principal_phone,
        journey_key=body.journey_key,
        capture_channel=body.capture_channel,
        bank_customer_ref=body.bank_customer_ref,
        identifiers=body.identifiers or [],
    )
    receipt = result.receipt
    channel_label = result.capture_channel or "mobile_banking"

    db.commit()
    db.refresh(receipt)

    event = IntegrationEvent(
        property_id=body.property_id,
        event_type="consent_given" if len(body.consented_purposes) > 0 else "consent_denied",
        session_id=body.session_id,
        ip_hash="mobile-sdk",
        user_agent=body.device_info or "Vajra Mobile SDK",
        payload={
            "deployment_id": str(body.deployment_id),
            "consented_purposes": body.consented_purposes,
            "journey_key": result.receipt.journey_key,
            "capture_channel": channel_label,
        },
        created_at=datetime.now(timezone.utc),
    )
    db.add(event)

    try:
        seal_consent_proof_vault(
            db,
            organization_id=property_obj.organization_id,
            receipt=receipt,
            live_version=result.live_version,
            channel=channel_label,
            source=body.device_info or "Vajra Mobile SDK",
        )
    except Exception as e:
        print(f"Failed to seal SDK consent receipt in Proof Vault: {e}")

    try:
        TagManagerService(db).record_consent_enforcement(body.property_id, body.consented_purposes)
    except Exception as e:
        print(f"Failed to record tag manager metrics from SDK consent: {e}")

    db.commit()
    return {"status": "success", "receipt_id": str(receipt.id), "proof_vault_record_id": str(receipt.proof_vault_record_id) if receipt.proof_vault_record_id else None}


@router.get("/{property_id}/proof/{record_id}/verify", response_model=PublicProofVerificationRead)
def verify_public_proof_record(
    property_id: UUID,
    record_id: UUID,
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    """Verify a proof vault record via API key — returns integrity status without exposing PII."""
    from app.services.proof_vault_payload import compute_proof_hash

    property_obj = verify_api_key(property_id, x_api_key, db)
    record = (
        db.query(ProofVaultRecord)
        .filter(
            ProofVaultRecord.id == record_id,
            ProofVaultRecord.organization_id == property_obj.organization_id,
        )
        .first()
    )
    if not record:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Proof record not found")

    payload_ok = True
    if record.proof_hash and record.proof_payload_json:
        payload_ok = compute_proof_hash(record.proof_payload_json) == record.proof_hash

    chain_ok = ProofVaultService._expected_hash(record) == record.current_hash

    return PublicProofVerificationRead(
        valid=payload_ok and chain_ok,
        payload_version=record.payload_version or 1,
        proof_hash=record.proof_hash,
        chain_hash=record.current_hash,
        block_number=record.block_number,
        payload_integrity_ok=payload_ok,
        chain_integrity_ok=chain_ok,
        dpdpa_data_minimization=True,
    )

