from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.consent import (
    ComplianceCheckResult,
    NoticeCreate,
    NoticeDetailRead,
    NoticeSummaryRead,
    NoticeVersionContentUpdate,
    NoticeVersionPurposesUpdate,
    NoticeVersionRead,
    PurposeCreate,
    PurposeDetailRead,
    PurposeRead,
    PurposeUpdate,
    NoticeActivityRead,
    PurposeActivityRead,
    TranslationRequest,
    TranslationResponse,
    NoticeApprovalAction,
    NoticeApprovalQueueItem,
)
from app.services.consent_service import ConsentService
from app.schemas.consent_banner import (
    BannerCreate,
    BannerRead,
    ConsentActivityRead,
    WebhookTestRequest,
    WebhookTestResponse,
)
from app.models.consent_banner import ConsentActivity
from app.services.banner_service import BannerService

router = APIRouter(prefix="/consent", tags=["consent"])


@router.get("/purposes", response_model=list[PurposeRead])
def list_purposes(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
) -> list[PurposeRead]:
    return ConsentService(db).list_purposes(
        current_user, org_id=org_id, include_archived=include_archived
    )


@router.post("/purposes", response_model=PurposeRead, status_code=status.HTTP_201_CREATED)
def create_purpose(
    body: PurposeCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PurposeRead:
    return ConsentService(db).create_purpose(current_user, body, org_id=org_id)


@router.get("/purposes/activities", response_model=list[PurposeActivityRead])
def list_purpose_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[PurposeActivityRead]:
    return ConsentService(db).list_purpose_activities(current_user, org_id=org_id)


@router.get("/purposes/{purpose_id}", response_model=PurposeDetailRead)
def get_purpose(
    purpose_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PurposeDetailRead:
    return ConsentService(db).get_purpose(current_user, purpose_id, org_id=org_id)


@router.patch("/purposes/{purpose_id}", response_model=PurposeRead)
def update_purpose(
    purpose_id: UUID,
    body: PurposeUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PurposeRead:
    return ConsentService(db).update_purpose(current_user, purpose_id, body, org_id=org_id)


@router.delete("/purposes/{purpose_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def archive_purpose(
    purpose_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    ConsentService(db).archive_purpose(current_user, purpose_id, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/purposes/{purpose_id}/unarchive", response_model=PurposeRead)
def unarchive_purpose(
    purpose_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PurposeRead:
    return ConsentService(db).unarchive_purpose(current_user, purpose_id, org_id=org_id)


@router.get("/notices", response_model=list[NoticeSummaryRead])
def list_notices(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
) -> list[NoticeSummaryRead]:
    return ConsentService(db).list_notices(
        current_user, org_id=org_id, include_archived=include_archived
    )


@router.post("/notices", response_model=NoticeDetailRead, status_code=status.HTTP_201_CREATED)
def create_notice(
    body: NoticeCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeDetailRead:
    return ConsentService(db).create_notice(current_user, body, org_id=org_id)


@router.get("/notices/activities", response_model=list[NoticeActivityRead])
def list_notice_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[NoticeActivityRead]:
    return ConsentService(db).list_notice_activities(current_user, org_id=org_id)


@router.get("/notices/approvals", response_model=list[NoticeApprovalQueueItem])
def list_notice_approvals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[NoticeApprovalQueueItem]:
    return ConsentService(db).list_approval_queue(current_user, org_id=org_id)


@router.get("/notices/{notice_id}", response_model=NoticeDetailRead)
def get_notice(
    notice_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeDetailRead:
    return ConsentService(db).get_notice(current_user, notice_id, org_id=org_id)


@router.get("/notices/{notice_id}/versions/{version_id}", response_model=NoticeVersionRead)
def get_notice_version(
    notice_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).get_notice_version(
        current_user, notice_id, version_id, org_id=org_id
    )


@router.patch("/notices/{notice_id}/versions/{version_id}", response_model=NoticeVersionRead)
def update_notice_version(
    notice_id: UUID,
    version_id: UUID,
    body: NoticeVersionContentUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).update_notice_version(
        current_user, notice_id, version_id, body, org_id=org_id
    )


@router.put("/notices/{notice_id}/versions/{version_id}/purposes", response_model=NoticeVersionRead)
def set_version_purposes(
    notice_id: UUID,
    version_id: UUID,
    body: NoticeVersionPurposesUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).set_version_purposes(
        current_user, notice_id, version_id, body, org_id=org_id
    )


@router.post("/notices/{notice_id}/versions/{version_id}/publish", response_model=NoticeVersionRead)
def publish_notice_version(
    notice_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).publish_version(
        current_user, notice_id, version_id, org_id=org_id
    )


@router.post(
    "/notices/{notice_id}/versions/{version_id}/submit-review",
    response_model=NoticeVersionRead,
)
def submit_notice_for_review(
    notice_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).submit_for_review(
        current_user, notice_id, version_id, org_id=org_id
    )


@router.post(
    "/notices/{notice_id}/versions/{version_id}/approve-legal",
    response_model=NoticeVersionRead,
)
def approve_notice_legal(
    notice_id: UUID,
    version_id: UUID,
    body: NoticeApprovalAction,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).approve_legal(
        current_user, notice_id, version_id, body, org_id=org_id
    )


@router.post(
    "/notices/{notice_id}/versions/{version_id}/approve-dpo",
    response_model=NoticeVersionRead,
)
def approve_notice_dpo(
    notice_id: UUID,
    version_id: UUID,
    body: NoticeApprovalAction,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).approve_dpo(
        current_user, notice_id, version_id, body, org_id=org_id
    )


@router.post(
    "/notices/{notice_id}/versions/{version_id}/reject-review",
    response_model=NoticeVersionRead,
)
def reject_notice_review(
    notice_id: UUID,
    version_id: UUID,
    body: NoticeApprovalAction,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).reject_review(
        current_user, notice_id, version_id, body, org_id=org_id
    )


@router.post(
    "/notices/{notice_id}/versions/{version_id}/compliance-check",
    response_model=ComplianceCheckResult,
)
def compliance_check(
    notice_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    auto_fix: bool = Query(default=False),
) -> ComplianceCheckResult:
    return ConsentService(db).run_compliance_check(
        current_user, notice_id, version_id, auto_fix=auto_fix, org_id=org_id
    )


@router.post("/notices/{notice_id}/draft-from-live", response_model=NoticeVersionRead)
def create_draft_from_live(
    notice_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeVersionRead:
    return ConsentService(db).create_draft_from_live(current_user, notice_id, org_id=org_id)


@router.post("/notices/{notice_id}/archive", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def archive_notice(
    notice_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    ConsentService(db).archive_notice(current_user, notice_id, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notices/{notice_id}/unarchive", response_model=NoticeDetailRead)
def unarchive_notice(
    notice_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeDetailRead:
    return ConsentService(db).unarchive_notice(current_user, notice_id, org_id=org_id)


@router.get("/banners", response_model=list[BannerRead])
def list_banners(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    include_archived: bool = Query(default=False),
) -> list[BannerRead]:
    return BannerService(db).list_banners(current_user, org_id=org_id, include_archived=include_archived)


@router.get("/banking/banner-presets")
def get_banking_banner_presets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    from app.models.organization_settings import OrganizationSettings
    from app.utils.industry_packs import default_banking_banner_presets, is_banking_industry

    service = ConsentService(db)
    resolved_org_id = service._resolve_org_id(current_user, org_id)
    settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == resolved_org_id)
        .first()
    )
    if not settings or not is_banking_industry(settings.primary_industry):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banking presets not available for this organization")
    return {"presets": default_banking_banner_presets()}


@router.get("/banners/{banner_id}/ab-summary")
def get_banner_ab_summary(
    banner_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    return BannerService(db).get_ab_summary(current_user, banner_id, org_id=org_id)


@router.post("/banners/{banner_id}/archive", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def archive_banner(
    banner_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    BannerService(db).archive_banner(current_user, banner_id, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/banners/{banner_id}/unarchive", response_model=BannerRead)
def unarchive_banner(
    banner_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BannerRead:
    return BannerService(db).unarchive_banner(current_user, banner_id, org_id=org_id)


@router.post("/banners", response_model=BannerRead, status_code=status.HTTP_201_CREATED)
def create_banner(
    body: BannerCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BannerRead:
    return BannerService(db).create_banner(current_user, body, org_id=org_id)


@router.get("/banners/{banner_id}", response_model=BannerRead)
def get_banner(
    banner_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BannerRead:
    return BannerService(db).get_banner(current_user, banner_id, org_id=org_id)


@router.put("/banners/{banner_id}", response_model=BannerRead)
def update_banner(
    banner_id: UUID,
    body: BannerCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BannerRead:
    return BannerService(db).update_banner(current_user, banner_id, body, org_id=org_id)


@router.post("/webhook/test", response_model=WebhookTestResponse)
def test_consent_webhook(
    body: WebhookTestRequest,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    property_id: UUID | None = Query(default=None),
    banner_id: UUID | None = Query(default=None),
) -> WebhookTestResponse:
    from app.models.integration_property import IntegrationProperty
    from app.services.consent_webhook_service import deliver_consent_webhook, validate_webhook_url

    resolved_org_id = ConsentService(db)._resolve_org_id(current_user, org_id)

    webhook_url = body.url
    if not webhook_url and banner_id:
        banner = BannerService(db).get_banner(current_user, banner_id, org_id=org_id)
        webhook_url = banner.consent_webhook_url

    try:
        webhook_url = validate_webhook_url(webhook_url)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    if not webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Webhook URL is required")

    target_property_id = property_id
    if not target_property_id and banner_id:
        from app.models.property_banner_association import PropertyBannerAssociation
        assoc = db.query(PropertyBannerAssociation).filter(
            PropertyBannerAssociation.banner_id == banner_id,
            PropertyBannerAssociation.status == "active",
        ).first()
        if assoc:
            target_property_id = assoc.property_id

    if not target_property_id:
        prop = db.query(IntegrationProperty).filter(
            IntegrationProperty.organization_id == resolved_org_id,
        ).first()
        if prop:
            target_property_id = prop.id

    if not target_property_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="property_id query param is required when no property is linked",
        )

    result = deliver_consent_webhook(
        db,
        webhook_url=webhook_url,
        property_id=target_property_id,
        organization_id=resolved_org_id,
        banner_id=str(banner_id) if banner_id else None,
        session_id=None,
        consented_purposes=None,
        language="en",
        receipt_id=None,
        is_test=True,
        test_event_type=body.event_type,
    )
    return WebhookTestResponse(**result)


@router.get("/activities", response_model=list[ConsentActivityRead])
def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ConsentActivityRead]:
    resolved_org_id = ConsentService(db)._resolve_org_id(current_user, org_id)
    
    # Query all activities of the organization
    activities = db.query(ConsentActivity).filter(
        ConsentActivity.organization_id == resolved_org_id
    ).order_by(ConsentActivity.created_at.desc()).all()
    
    # Auto-seed initial activities if history is completely empty
    if not activities:
        from app.models.consent_banner import ConsentBanner
        from app.models.property_banner_association import PropertyBannerAssociation
        from app.models.integration_property import IntegrationProperty
        
        banners = db.query(ConsentBanner).filter(
            ConsentBanner.organization_id == resolved_org_id
        ).all()
        
        for banner in banners:
            # Seed creation activity
            created_act = ConsentActivity(
                organization_id=resolved_org_id,
                banner_id=banner.id,
                action="Created banner",
                banner_name=banner.name,
                banner_version="v1.0",
                user_name=current_user.full_name or current_user.email or "System",
                created_at=banner.created_at,
                updated_at=banner.created_at,
            )
            db.add(created_act)
            
            # Seed update activity if it was modified
            if banner.updated_at > banner.created_at:
                updated_act = ConsentActivity(
                    organization_id=resolved_org_id,
                    banner_id=banner.id,
                    action="Content updated",
                    banner_name=banner.name,
                    banner_version=banner.version,
                    user_name=current_user.full_name or current_user.email or "System",
                    created_at=banner.updated_at,
                    updated_at=banner.updated_at,
                )
                db.add(updated_act)
                
            # Seed deployment activity if active
            active_assoc = db.query(PropertyBannerAssociation).filter(
                PropertyBannerAssociation.banner_id == banner.id,
                PropertyBannerAssociation.status == "active"
            ).first()
            if active_assoc:
                prop = db.query(IntegrationProperty).filter(
                    IntegrationProperty.id == active_assoc.property_id
                ).first()
                if prop:
                    deployed_act = ConsentActivity(
                        organization_id=resolved_org_id,
                        banner_id=banner.id,
                        action=f"Deployed to {prop.domain}",
                        banner_name=banner.name,
                        banner_version=banner.version,
                        user_name=current_user.full_name or current_user.email or "System",
                        deployed_on=[{"type": "website", "label": prop.domain}],
                        created_at=active_assoc.created_at,
                        updated_at=active_assoc.created_at,
                    )
                    db.add(deployed_act)
                    
        db.commit()
        
        # Re-fetch activities
        activities = db.query(ConsentActivity).filter(
            ConsentActivity.organization_id == resolved_org_id
        ).order_by(ConsentActivity.created_at.desc()).all()
        
    return activities


@router.post("/translate", response_model=TranslationResponse)
def translate_text_proxy(
    body: TranslationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> TranslationResponse:
    import urllib.request
    import urllib.parse
    import urllib.error
    import json
    from app.services.contracts.banner_contract import clean_and_translate

    text = body.text.strip()
    target_lang = body.target_lang
    
    if not text:
        return TranslationResponse(translatedText="")
        
    # First: Try LibreTranslate mirrors (as requested by user)
    mirrors = [
        "https://translate.terraprint.co/translate",
        "https://libretranslate.de/translate",
        "https://translate.fedilab.app/translate",
        "https://lt.vern.cc/translate"
    ]
    payload = {
        "q": text,
        "source": "en",
        "target": target_lang,
        "format": "text"
    }
    data = json.dumps(payload).encode("utf-8")
    
    for url in mirrors:
        try:
            req = urllib.request.Request(
                url,
                data=data,
                headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status == 200:
                    resp_content = response.read().decode("utf-8")
                    # Make sure it's actually JSON and has translatedText
                    resp_data = json.loads(resp_content)
                    if isinstance(resp_data, dict) and "translatedText" in resp_data:
                        return TranslationResponse(translatedText=resp_data["translatedText"])
        except Exception:
            # Continue on failure
            pass

    # Second: Try MyMemory API as a robust free open-source fallback
    try:
        mymemory_url = f"https://api.mymemory.translated.net/get?q={urllib.parse.quote(text)}&langpair=en|{target_lang}"
        req = urllib.request.Request(
            mymemory_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                resp_data = json.loads(response.read().decode("utf-8"))
                if isinstance(resp_data, dict) and resp_data.get("responseData") and resp_data["responseData"].get("translatedText"):
                    return TranslationResponse(translatedText=resp_data["responseData"]["translatedText"])
    except Exception:
        pass
            
    # Third: Fallback to local dictionary mapping
    fallback_val = clean_and_translate(text, target_lang)
    return TranslationResponse(translatedText=fallback_val)


from typing import Any
from fastapi.responses import StreamingResponse
import io
from app.models.consent_receipt import ConsentReceipt
from app.schemas.consent_receipt import ConsentReceiptPaginatedRead

@router.get("/receipts", response_model=ConsentReceiptPaginatedRead)
def list_consent_receipts(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    property_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    search: str | None = Query(default=None),
) -> Any:
    resolved_org_id = ConsentService(db)._resolve_org_id(current_user, org_id)
    q = db.query(ConsentReceipt).filter(ConsentReceipt.organization_id == resolved_org_id)
    
    if property_id:
        q = q.filter(ConsentReceipt.property_id == property_id)
        
    if search:
        search_filter = f"%{search}%"
        q = q.filter(
            (ConsentReceipt.session_id.ilike(search_filter)) |
            (ConsentReceipt.principal_email.ilike(search_filter)) |
            (ConsentReceipt.principal_phone.ilike(search_filter)) |
            (ConsentReceipt.bank_customer_ref.ilike(search_filter)) |
            (ConsentReceipt.capture_channel.ilike(search_filter)) |
            (ConsentReceipt.journey_key.ilike(search_filter)) |
            (ConsentReceipt.ip_hash.ilike(search_filter))
        )
        
    total = q.count()
    receipts = q.order_by(ConsentReceipt.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    items = []
    for r in receipts:
        items.append({
            "id": r.id,
            "property_id": r.property_id,
            "property_domain": r.property.domain if r.property else None,
            "organization_id": r.organization_id,
            "session_id": r.session_id,
            "consented_purposes": r.consented_purposes,
            "language": r.language,
            "principal_email": r.principal_email,
            "principal_phone": r.principal_phone,
            "portal_sms_sent_at": r.portal_sms_sent_at,
            "portal_sms_status": r.portal_sms_status,
            "capture_channel": r.capture_channel,
            "journey_key": r.journey_key,
            "bank_customer_ref": r.bank_customer_ref,
            "principal_id": r.principal_id,
            "identifier_snapshot": r.identifier_snapshot,
            "proof_vault_record_id": r.proof_vault_record_id,
            "assisted_capture_metadata": r.assisted_capture_metadata,
            "created_at": r.created_at,
            "ip_hash": r.ip_hash,
            "user_agent": r.user_agent
        })
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }


@router.get("/receipts/export/xlsx")
def export_consent_receipts(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    property_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
) -> StreamingResponse:
    from openpyxl import Workbook
    
    resolved_org_id = ConsentService(db)._resolve_org_id(current_user, org_id)
    q = db.query(ConsentReceipt).filter(ConsentReceipt.organization_id == resolved_org_id)
    
    if property_id:
        q = q.filter(ConsentReceipt.property_id == property_id)
        
    if search:
        search_filter = f"%{search}%"
        q = q.filter(
            (ConsentReceipt.session_id.ilike(search_filter)) |
            (ConsentReceipt.principal_email.ilike(search_filter)) |
            (ConsentReceipt.principal_phone.ilike(search_filter)) |
            (ConsentReceipt.bank_customer_ref.ilike(search_filter)) |
            (ConsentReceipt.capture_channel.ilike(search_filter)) |
            (ConsentReceipt.journey_key.ilike(search_filter)) |
            (ConsentReceipt.ip_hash.ilike(search_filter))
        )
        
    receipts = q.order_by(ConsentReceipt.created_at.desc()).all()
    
    from app.models.consent import Purpose
    # Fetch organization purposes to resolve UUID -> Name
    purposes = db.query(Purpose).filter(Purpose.organization_id == resolved_org_id).all()
    purpose_name_map = {str(p.id): p.name for p in purposes}
    
    # Identify all unique purpose keys across all matching receipts
    unique_purposes = set()
    for r in receipts:
        if isinstance(r.consented_purposes, dict):
            unique_purposes.update(r.consented_purposes.keys())
    unique_purposes = sorted(list(unique_purposes))
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Consent Receipts"
    
    # Build dynamic headers list
    headers = [
        "Receipt ID",
        "Property Domain",
        "Session ID",
        "Principal Email",
        "Principal Phone",
        "Language",
        "IP Hash",
        "Created At"
    ]
    for p_key in unique_purposes:
        p_name = purpose_name_map.get(p_key, "Strictly Necessary" if p_key == "necessary" else p_key)
        headers.append(f"Purpose: {p_name}")
        
    ws.append(headers)
    
    for r in receipts:
        row = [
            str(r.id),
            r.property.domain if r.property else "",
            r.session_id,
            r.principal_email or "",
            r.principal_phone or "",
            r.language,
            r.ip_hash,
            r.created_at.strftime("%Y-%m-%d %H:%M:%S") if r.created_at else ""
        ]
        for p_key in unique_purposes:
            is_consented = r.consented_purposes.get(p_key)
            if is_consented is None:
                status = "N/A"
            else:
                status = "Accepted" if is_consented else "Rejected"
            row.append(status)
        ws.append(row)
        
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    
    headers = {
        'Content-Disposition': 'attachment; filename="consent_receipts.xlsx"'
    }
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers
    )




