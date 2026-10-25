from typing import Annotated, Any
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Response, status, HTTPException, Request, UploadFile, File
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.notice_delivery import (
    NoticeCampaign,
    NoticeDeliveryProvider,
    ProviderCredential,
    CampaignDelivery,
    NoticeCampaignActivity,
    DeliveryAttempt,
    DeliveryEvent,
)
from app.schemas.notice_delivery import (
    NoticeCampaignCreate,
    NoticeCampaignRead,
    NoticeDeliveryProviderCreate,
    NoticeDeliveryProviderUpdate,
    NoticeDeliveryProviderRead,
    ConsentPortalEmailConfig,
    ConsentPortalEmailConfigUpdate,
    DpNotificationAutoConfig,
    CampaignDeliveryRead,
    NoticeCampaignActivityRead,
    CampaignOverviewStats,
    SmartAudienceDiff,
    RecipientContactRead,
    CampaignRecipientUploadRead,
    CampaignRecipientPreview,
    CampaignRecipientMappingUpdate,
    DataAssetRecipientPreviewRequest,
)
from app.services.notice_delivery_service import NoticeDeliveryService
from app.services.campaign_recipient_service import CampaignRecipientService
from app.services.notice_delivery_serializers import (
    build_dp_notification_auto_config,
    provider_to_read,
)
from app.services.credential_encryption import encrypt_value
from app.models.organization_settings import OrganizationSettings
from app.services.consent_portal_email_service import (
    build_consent_portal_email_config,
    update_consent_portal_email_config,
)

router = APIRouter(prefix="/notice-delivery", tags=["Notice Delivery"])


@router.get("/campaigns", response_model=list[NoticeCampaignRead])
def list_campaigns(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[NoticeCampaignRead]:
    return NoticeDeliveryService(db).list_campaigns(current_user)


@router.post("/campaigns", response_model=NoticeCampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign(
    body: NoticeCampaignCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> NoticeCampaignRead:
    return NoticeDeliveryService(db).create_campaign(current_user, body.model_dump())


@router.get("/campaigns/{campaign_id}", response_model=NoticeCampaignRead)
def get_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> NoticeCampaignRead:
    campaign = db.query(NoticeCampaign).filter(NoticeCampaign.id == campaign_id).first()
    if not campaign:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.post("/campaigns/{campaign_id}/action", response_model=NoticeCampaignRead)
def transition_campaign(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    action: str = Query(...),  # legal_review, dpo_approval, scheduled, running, paused, completed, archived
    db: Session = Depends(get_db),
) -> NoticeCampaignRead:
    return NoticeDeliveryService(db).transition_campaign_status(current_user, campaign_id, action)


@router.get("/campaigns/{campaign_id}/deliveries", response_model=list[CampaignDeliveryRead])
def list_campaign_deliveries(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[CampaignDeliveryRead]:
    return db.query(CampaignDelivery).filter(CampaignDelivery.campaign_id == campaign_id).order_by(CampaignDelivery.created_at.desc()).all()


@router.post("/campaigns/{campaign_id}/retry-delivery/{delivery_id}", status_code=status.HTTP_200_OK)
def retry_campaign_delivery(
    campaign_id: UUID,
    delivery_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
):
    svc = NoticeDeliveryService(db)
    svc.execute_delivery_dispatch(db, delivery_id)
    return {"status": "dispatched"}


@router.get("/campaigns/{campaign_id}/activities", response_model=list[NoticeCampaignActivityRead])
def list_campaign_activities(
    campaign_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[NoticeCampaignActivityRead]:
    return db.query(NoticeCampaignActivity).filter(NoticeCampaignActivity.campaign_id == campaign_id).order_by(NoticeCampaignActivity.created_at.desc()).all()


@router.get("/providers", response_model=list[NoticeDeliveryProviderRead])
def list_providers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[NoticeDeliveryProviderRead]:
    resolved = NoticeDeliveryService(db)._resolve_org_id(current_user, org_id)
    providers = (
        db.query(NoticeDeliveryProvider)
        .filter(NoticeDeliveryProvider.organization_id == resolved)
        .all()
    )
    return [provider_to_read(provider) for provider in providers]


@router.get("/providers/dp-notification-config", response_model=DpNotificationAutoConfig)
def get_dp_notification_config(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DpNotificationAutoConfig:
    resolved = NoticeDeliveryService(db)._resolve_org_id(current_user, org_id)
    providers = (
        db.query(NoticeDeliveryProvider)
        .filter(NoticeDeliveryProvider.organization_id == resolved)
        .all()
    )
    settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == resolved)
        .first()
    )
    return build_dp_notification_auto_config(providers, settings)


@router.get("/providers/consent-portal-email-config", response_model=ConsentPortalEmailConfig)
def get_consent_portal_email_config(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentPortalEmailConfig:
    resolved = NoticeDeliveryService(db)._resolve_org_id(current_user, org_id)
    settings = (
        db.query(OrganizationSettings)
        .filter(OrganizationSettings.organization_id == resolved)
        .first()
    )
    return build_consent_portal_email_config(db, resolved, settings)


@router.put("/providers/consent-portal-email-config", response_model=ConsentPortalEmailConfig)
def put_consent_portal_email_config(
    body: ConsentPortalEmailConfigUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentPortalEmailConfig:
    resolved = NoticeDeliveryService(db)._resolve_org_id(current_user, org_id)
    return update_consent_portal_email_config(
        db,
        resolved,
        enabled=body.enabled,
        email_field_label=body.email_field_label,
    )


@router.post("/providers", response_model=NoticeDeliveryProviderRead, status_code=status.HTTP_201_CREATED)
def create_provider(
    body: NoticeDeliveryProviderCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeDeliveryProviderRead:
    resolved = NoticeDeliveryService(db)._resolve_org_id(current_user, org_id)
    
    provider = NoticeDeliveryProvider(
        organization_id=resolved,
        channel=body.channel,
        provider_name=body.provider_name,
        is_active=body.is_active
    )
    db.add(provider)
    db.flush()

    for key, val in body.config.items():
        cred = ProviderCredential(
            provider_id=provider.id,
            credential_key=key,
            credential_value=encrypt_value(val)
        )
        db.add(cred)

    db.commit()
    db.refresh(provider)
    return provider_to_read(provider)


@router.put("/providers/{provider_id}", response_model=NoticeDeliveryProviderRead)
def update_provider(
    provider_id: UUID,
    body: NoticeDeliveryProviderUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> NoticeDeliveryProviderRead:
    provider = db.query(NoticeDeliveryProvider).filter(NoticeDeliveryProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Provider configuration not found")

    if body.provider_name is not None:
        provider.provider_name = body.provider_name
    if body.is_active is not None:
        provider.is_active = body.is_active
    if body.config is not None:
        # Delete old credentials and write new ones
        db.query(ProviderCredential).filter(ProviderCredential.provider_id == provider_id).delete()
        for key, val in body.config.items():
            cred = ProviderCredential(
                provider_id=provider_id,
                credential_key=key,
                credential_value=encrypt_value(val)
            )
            db.add(cred)

    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider_to_read(provider)


@router.get("/providers/{provider_id}/test")
def test_provider_connection(
    provider_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
):
    provider = db.query(NoticeDeliveryProvider).filter(NoticeDeliveryProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    
    org_id = NoticeDeliveryService(db)._resolve_org_id(current_user, None)
    if provider.organization_id != org_id:
        raise HTTPException(status_code=403, detail="Not authorized to access this provider")

    # Construct test recipient and content
    recipient = {
        "name": "ZeroShield Tester",
        "email": "test@zeroshield.ai",
        "phone": "+15005550006",  # Twilio magic test number
        "address": "123 Test Street, Mumbai, Maharashtra, 400001",
        "pincode": "400001",
        "city": "Mumbai",
        "state": "Maharashtra"
    }
    subject = "ZeroShield Connection Test Notice"
    body = "This is a test notification to verify your Notice Delivery Channel settings are correct and working."

    try:
        from app.services.notice_delivery_service import ProviderRegistry
        adapter = ProviderRegistry.get_adapter(provider.channel, db, org_id)
        res = adapter.send_notice(recipient, subject, body)
        if res["success"]:
            return {"success": True, "message": "Connection test succeeded!", "response": res["provider_response"]}
        else:
            return {"success": False, "message": res["error_message"] or "Provider execution failed", "response": res["provider_response"]}
    except Exception as e:
        return {"success": False, "message": f"Test failed with error: {str(e)}"}


@router.get("/recipients/search", response_model=list[RecipientContactRead])
def search_recipients(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    q: str | None = Query(default=None),
    segment: str = Query(default="all"),
    notice_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, le=500),
) -> list[RecipientContactRead]:
    return CampaignRecipientService(db).search_known_contacts(
        current_user, q=q, segment=segment, notice_id=notice_id, limit=limit
    )


@router.post("/recipients/upload", response_model=CampaignRecipientUploadRead, status_code=status.HTTP_201_CREATED)
async def upload_recipient_csv(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    file: UploadFile = File(...),
) -> CampaignRecipientUploadRead:
    record = await CampaignRecipientService(db).upload_csv(current_user, file)
    return record


@router.put("/recipients/upload/{upload_id}/mapping", response_model=CampaignRecipientUploadRead)
def map_recipient_upload(
    upload_id: UUID,
    body: CampaignRecipientMappingUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> CampaignRecipientUploadRead:
    return CampaignRecipientService(db).save_upload_mapping(current_user, upload_id, body.field_map)


@router.get("/recipients/upload/{upload_id}/preview", response_model=CampaignRecipientPreview)
def preview_recipient_upload(
    upload_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(default=20, le=100),
) -> CampaignRecipientPreview:
    return CampaignRecipientService(db).preview_upload(current_user, upload_id, limit=limit)


@router.post("/recipients/from-asset/preview", response_model=CampaignRecipientPreview)
def preview_data_asset_recipients(
    body: DataAssetRecipientPreviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(default=20, le=100),
) -> CampaignRecipientPreview:
    return CampaignRecipientService(db).preview_data_asset(
        current_user, asset_id=body.asset_id, field_map=body.field_map, limit=limit
    )


@router.post("/webhooks/ses")
def webhook_ses(payload: dict, db: Session = Depends(get_db)):
    notification_type = payload.get("eventType") or payload.get("notificationType")
    mail = payload.get("mail", {})
    message_id = mail.get("messageId")
    
    if message_id:
        from sqlalchemy import cast, String
        attempt = db.query(DeliveryAttempt).filter(
            cast(DeliveryAttempt.response_payload["message_id"], String) == f'"{message_id}"'
        ).first()
        
        if attempt:
            status_map = {
                "Bounce": "failed",
                "Complaint": "complained",
                "Delivery": "delivered"
            }
            new_status = status_map.get(notification_type, "updated")
            attempt.status = new_status
            
            evt = DeliveryEvent(
                attempt_id=attempt.id,
                event_type=f"ses_{notification_type.lower() if notification_type else 'update'}",
                payload=payload,
                occurred_at=datetime.now(timezone.utc)
            )
            db.add(evt)
            
            delivery = attempt.delivery
            if delivery:
                if new_status == "delivered":
                    delivery.status = "delivered"
                elif new_status == "failed":
                    delivery.status = "failed"
            
            db.commit()
    return {"status": "processed"}


@router.post("/webhooks/twilio")
async def webhook_twilio(request: Request, db: Session = Depends(get_db)):
    form_data = await request.form()
    sms_id = form_data.get("SmsSid") or form_data.get("MessageSid")
    status = form_data.get("MessageStatus")
    
    if sms_id:
        from sqlalchemy import cast, String
        attempt = db.query(DeliveryAttempt).filter(
            cast(DeliveryAttempt.response_payload["sms_id"], String) == f'"{sms_id}"'
        ).first()
        
        if attempt:
            attempt.status = status
            
            evt = DeliveryEvent(
                attempt_id=attempt.id,
                event_type=f"twilio_{status}",
                payload=dict(form_data),
                occurred_at=datetime.now(timezone.utc)
            )
            db.add(evt)
            
            delivery = attempt.delivery
            if delivery:
                if status == "delivered":
                    delivery.status = "delivered"
                elif status in ["failed", "undelivered"]:
                    delivery.status = "failed"
            
            db.commit()
    return {"status": "processed"}


@router.post("/webhooks/shiprocket")
def webhook_shiprocket(payload: dict, db: Session = Depends(get_db)):
    awb = payload.get("awb")
    status = payload.get("current_status")
    
    if awb:
        from sqlalchemy import cast, String
        attempt = db.query(DeliveryAttempt).filter(
            cast(DeliveryAttempt.response_payload["awb_code"], String) == f'"{awb}"'
        ).first()
        
        if attempt:
            attempt.status = status
            
            evt = DeliveryEvent(
                attempt_id=attempt.id,
                event_type=f"shiprocket_{status}",
                payload=payload,
                occurred_at=datetime.now(timezone.utc)
            )
            db.add(evt)
            
            delivery = attempt.delivery
            if delivery:
                if status == "delivered":
                    delivery.status = "delivered"
                elif status == "canceled" or "failed" in status.lower():
                    delivery.status = "failed"
            
            db.commit()
    return {"status": "processed"}


@router.get("/analytics", response_model=CampaignOverviewStats)
def get_analytics(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CampaignOverviewStats:
    return NoticeDeliveryService(db).get_campaign_overview_stats(current_user)


@router.get("/segment-counts", response_model=dict[str, int])
def get_segment_counts(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    notice_id: UUID | None = Query(default=None),
) -> dict[str, int]:
    return NoticeDeliveryService(db).get_segment_counts(current_user, notice_id)


@router.get("/notice-audience-diff/{notice_id}", response_model=SmartAudienceDiff)
def get_audience_diff(
    notice_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    segment: str = Query(default="all"),
) -> SmartAudienceDiff:
    return NoticeDeliveryService(db).get_smart_audience_diff(current_user, notice_id, segment)
