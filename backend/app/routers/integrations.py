from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.integration_api_key import IntegrationApiKey
from app.models.consent_banner import ConsentBanner
from app.models.user import User, UserRole
from app.models.integration_property import IntegrationProperty
from app.models.integration_event import IntegrationEvent
from app.models.consent_receipt import ConsentReceipt
from sqlalchemy import desc, func, or_, select
from datetime import datetime, timezone, timedelta
from app.schemas.integration_metrics import IntegrationAnalyticsDailyRead, PageCoverageScanRead
from app.schemas.consent_banner import BannerRead
from app.schemas.property_deployment import (
    PropertyDeploymentCreate,
    PropertyDeploymentUpdate,
    PropertyDeploymentRead,
    DeploymentConfigurationVersionRead,
)
from app.schemas.integration_property import (
    BannerAssociationUpdate,
    IntegrationApiKeyRead,
    IntegrationPropertyCreate,
    IntegrationPropertyDetail,
    IntegrationPropertyRead,
    IntegrationPropertyUpdate,
    PropertyBannerAssociationRead,
    PropertyWithKey,
    IntegrationEventRead,
    PropertyWebhookConfigRead,
    PropertyWebhookConfigUpdate,
    OrgDataRightsWebhookConfigRead,
    OrgDataRightsWebhookConfigUpdate,
    WebhookDeliveryLogRead,
    PropertyDeleteImpact,
)
from app.schemas.integrations_stats import (
    IntegrationsOverviewStats,
    ConsentSearchResponse,
    ConsentSearchTimelineEvent,
    RecentActivityResponse,
    RecentActivityEvent,
)
from app.schemas.integration_snippet import SnippetEmailRequest, SnippetOutput
from app.schemas.integration_verification import PropertyVerificationRead
from app.services.coverage_service import CoverageService
from app.services.integration_analytics_service import AnalyticsService
from app.services.property_service import PropertyService
from app.services.snippet_service import SnippetService
from app.services.verification_service import VerificationService
from app.services.tracker_service import TrackerService
from app.services.banner_service import BannerService
from app.services.consent_webhook_service import list_webhook_deliveries, redeliver_from_log
from app.schemas.cookie_tracker import CookieScanJobRead, TrackerWithOverrideRead, TrackerOverrideUpdate
from fastapi import BackgroundTasks

router = APIRouter(prefix="/integrations", tags=["integrations"])

OrgIdQuery = Annotated[UUID | None, Query()]


def _property_banner_meta(prop, db: Session) -> tuple[PropertyBannerAssociationRead | None, str | None]:
    active_banner = next((b for b in prop.banner_associations if b.status == "active"), None)
    if not active_banner:
        return None, None

    banner_name = None
    banner = db.query(ConsentBanner).filter(ConsentBanner.id == active_banner.banner_id).first()
    if banner:
        banner_name = f"{banner.name} {banner.version}".strip()

    return PropertyBannerAssociationRead.model_validate(active_banner), banner_name


def _serialize_property(prop, db: Session) -> IntegrationPropertyRead:
    active_banner, active_banner_name = _property_banner_meta(prop, db)
    resp = IntegrationPropertyRead.model_validate(prop)
    resp.active_banner = active_banner
    resp.active_banner_name = active_banner_name
    
    score, grade = PropertyService(db).calculate_property_health(prop.id)
    resp.health_score = score
    resp.health_grade = grade
    resp.last_updated_time = prop.updated_at
    return resp


# --- Properties ---

@router.get("/properties", response_model=list[IntegrationPropertyRead])
def list_properties(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[IntegrationPropertyRead]:
    props = PropertyService(db).list_properties(current_user, org_id=org_id)
    return [_serialize_property(prop, db) for prop in props]


@router.post("/properties", response_model=PropertyWithKey, status_code=status.HTTP_201_CREATED)
def create_property(
    body: IntegrationPropertyCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PropertyWithKey:
    prop, raw_key, key_prefix = PropertyService(db).create_property(
        current_user, body, org_id=org_id
    )
    
    # Manually map to schema to include the raw key (shown only once)
    resp_dict = IntegrationPropertyRead.model_validate(prop).model_dump()
    resp_dict["api_key"] = raw_key
    resp_dict["api_key_prefix"] = key_prefix
    return PropertyWithKey.model_validate(resp_dict)


@router.get("/properties/{property_id}", response_model=IntegrationPropertyDetail)
def get_property(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> IntegrationPropertyDetail:
    prop = PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    
    # Active api keys mapping
    api_keys = [k for k in prop.api_keys if k.status == "active"]
    
    active_banner = next((b for b in prop.banner_associations if b.status == "active"), None)

    active_banner, active_banner_name = _property_banner_meta(prop, db)

    resp = IntegrationPropertyDetail.model_validate(prop)
    resp.api_keys = [IntegrationApiKeyRead.model_validate(k) for k in api_keys]
    resp.active_banner = active_banner
    resp.active_banner_name = active_banner_name
    
    score, grade = PropertyService(db).calculate_property_health(prop.id)
    resp.health_score = score
    resp.health_grade = grade
    resp.last_updated_time = prop.updated_at
    return resp


@router.patch("/properties/{property_id}", response_model=IntegrationPropertyRead)
def update_property(
    property_id: UUID,
    body: IntegrationPropertyUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> IntegrationPropertyRead:
    prop = PropertyService(db).update_property(current_user, property_id, body, org_id=org_id)
    return _serialize_property(prop, db)


@router.delete("/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> None:
    PropertyService(db).delete_property(current_user, property_id, org_id=org_id)


@router.get("/properties/{property_id}/delete-impact", response_model=PropertyDeleteImpact)
def get_property_delete_impact(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyDeleteImpact:
    impact = PropertyService(db).get_delete_impact(current_user, property_id, org_id=org_id)
    return impact


# --- API Keys ---

@router.get("/properties/{property_id}/keys", response_model=list[IntegrationApiKeyRead])
def list_api_keys(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> list[IntegrationApiKeyRead]:
    prop = PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    active_keys = [k for k in prop.api_keys if k.status == "active"]
    return [IntegrationApiKeyRead.model_validate(k) for k in active_keys]


@router.post("/properties/{property_id}/keys", response_model=dict, status_code=status.HTTP_201_CREATED)
def generate_api_key(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    label: str = Query("Default"),
    org_id: OrgIdQuery = None,
) -> dict:
    """Returns {api_key, api_key_prefix}"""
    result = PropertyService(db).generate_new_api_key(current_user, property_id, label, org_id=org_id)
    return {
        "api_key": result["raw_key"],
        "api_key_prefix": result["prefix"],
        "id": str(result["obj"].id),
    }


@router.delete("/properties/{property_id}/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_api_key(
    property_id: UUID,
    key_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> None:
    PropertyService(db).revoke_api_key(current_user, property_id, key_id, org_id=org_id)


# --- Banner Association ---

@router.get("/properties/{property_id}/banner", response_model=PropertyBannerAssociationRead | None)
def get_property_banner(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyBannerAssociationRead | None:
    assoc = PropertyService(db).get_active_banner(current_user, property_id, org_id=org_id)
    return PropertyBannerAssociationRead.model_validate(assoc) if assoc else None


@router.put("/properties/{property_id}/banner", response_model=PropertyBannerAssociationRead)
def set_property_banner(
    property_id: UUID,
    body: BannerAssociationUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyBannerAssociationRead:
    assoc = PropertyService(db).set_active_banner(current_user, property_id, body.banner_id, org_id=org_id)
    return PropertyBannerAssociationRead.model_validate(assoc)


@router.delete("/properties/{property_id}/banner", status_code=status.HTTP_204_NO_CONTENT)
def remove_property_banner(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> None:
    # We "remove" by just deactivating the active one
    svc = PropertyService(db)
    active = svc.get_active_banner(current_user, property_id, org_id=org_id)
    if active:
        from datetime import datetime, timezone
        active.status = "inactive"
        active.deactivated_at = datetime.now(timezone.utc)
        db.commit()

        # Log disconnect activity
        try:
            prop = svc.get_property(current_user, property_id, org_id=org_id)
            from app.services.banner_service import BannerService
            banner_svc = BannerService(db)
            banner = banner_svc.get_banner(current_user, active.banner_id, org_id=active.organization_id)
            banner_svc.log_activity(
                current_user,
                banner,
                f"Disconnected from {prop.domain}"
            )
        except Exception as e:
            print(f"Failed to log disconnect activity: {e}")


# --- Webhook config & delivery logs ---


def _banner_webhook_config_read(property_id: UUID, banner_id: UUID, banner: ConsentBanner) -> PropertyWebhookConfigRead:
    return PropertyWebhookConfigRead(
        property_id=property_id,
        banner_id=banner_id,
        url=banner.consent_webhook_url,
        signing_secret_set=bool(banner.webhook_signing_secret),
        subscribed_events=list(banner.webhook_subscribed_events or []),
        bearer_token_set=bool(banner.webhook_bearer_token),
    )


@router.get("/properties/{property_id}/webhook-config", response_model=PropertyWebhookConfigRead)
def get_property_webhook_config(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyWebhookConfigRead:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    assoc = PropertyService(db).get_active_banner(current_user, property_id, org_id=org_id)
    if not assoc:
        return PropertyWebhookConfigRead(property_id=property_id, banner_id=None, url=None)

    banner = db.query(ConsentBanner).filter(ConsentBanner.id == assoc.banner_id).first()
    if not banner:
        return PropertyWebhookConfigRead(property_id=property_id, banner_id=assoc.banner_id, url=None)
    return _banner_webhook_config_read(property_id, assoc.banner_id, banner)


@router.put("/properties/{property_id}/webhook-config", response_model=PropertyWebhookConfigRead)
def update_property_webhook_config(
    property_id: UUID,
    body: PropertyWebhookConfigUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyWebhookConfigRead:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    assoc = PropertyService(db).get_active_banner(current_user, property_id, org_id=org_id)
    if not assoc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Link an active consent banner to this property before configuring webhooks.",
        )

    banner = BannerService(db).set_webhook_config(
        current_user,
        assoc.banner_id,
        url=body.url,
        signing_secret=body.signing_secret,
        subscribed_events=body.subscribed_events,
        bearer_token=body.bearer_token,
        org_id=org_id,
    )
    return _banner_webhook_config_read(property_id, assoc.banner_id, banner)


@router.post("/properties/{property_id}/webhook-deliveries/{delivery_id}/redeliver")
def redeliver_property_webhook(
    property_id: UUID,
    delivery_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> dict:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    try:
        return redeliver_from_log(db, delivery_log_id=delivery_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/webhooks/run-expiry-scan")
def run_consent_expiry_webhook_scan(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> dict:
    """Dispatch consent.expired for receipts past banner validity (Req 7)."""
    from app.services.consent_expiry_webhook_service import process_expired_consents
    from app.services.consent_service import ConsentService

    resolved = ConsentService(db)._resolve_org_id(current_user, org_id)
    return process_expired_consents(db, organization_id=resolved)


@router.get("/data-rights-webhook-config", response_model=OrgDataRightsWebhookConfigRead)
def get_data_rights_webhook_config(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> OrgDataRightsWebhookConfigRead:
    from app.models.organization_settings import OrganizationSettings
    from app.services.consent_service import ConsentService

    resolved = ConsentService(db)._resolve_org_id(current_user, org_id)
    settings = db.query(OrganizationSettings).filter_by(organization_id=resolved).first()
    cfg = (settings.dsar_sla_config or {}) if settings else {}
    return OrgDataRightsWebhookConfigRead(
        organization_id=resolved,
        url=cfg.get("data_rights_webhook_url"),
        signing_secret_set=bool(cfg.get("data_rights_webhook_signing_secret")),
        subscribed_events=list(cfg.get("data_rights_webhook_subscribed_events") or []),
        bearer_token_set=bool(cfg.get("data_rights_webhook_bearer_token")),
    )


@router.put("/data-rights-webhook-config", response_model=OrgDataRightsWebhookConfigRead)
def update_data_rights_webhook_config(
    body: OrgDataRightsWebhookConfigUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> OrgDataRightsWebhookConfigRead:
    from app.models.organization_settings import OrganizationSettings
    from app.services.consent_service import ConsentService
    from app.services.consent_webhook_service import validate_webhook_url

    resolved = ConsentService(db)._resolve_org_id(current_user, org_id)
    settings = db.query(OrganizationSettings).filter_by(organization_id=resolved).first()
    if settings is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization settings not found")

    cfg = dict(settings.dsar_sla_config or {})
    if body.url is not None:
        cfg["data_rights_webhook_url"] = validate_webhook_url(body.url)
    if body.signing_secret is not None:
        cfg["data_rights_webhook_signing_secret"] = body.signing_secret.strip() or None
    if body.subscribed_events is not None:
        cfg["data_rights_webhook_subscribed_events"] = body.subscribed_events or []
    if body.bearer_token is not None:
        cfg["data_rights_webhook_bearer_token"] = body.bearer_token.strip() or None
    settings.dsar_sla_config = cfg
    db.commit()
    db.refresh(settings)
    return OrgDataRightsWebhookConfigRead(
        organization_id=resolved,
        url=cfg.get("data_rights_webhook_url"),
        signing_secret_set=bool(cfg.get("data_rights_webhook_signing_secret")),
        subscribed_events=list(cfg.get("data_rights_webhook_subscribed_events") or []),
        bearer_token_set=bool(cfg.get("data_rights_webhook_bearer_token")),
    )


@router.get("/properties/{property_id}/webhook-deliveries", response_model=list[WebhookDeliveryLogRead])
def list_property_webhook_deliveries(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    org_id: OrgIdQuery = None,
) -> list[WebhookDeliveryLogRead]:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    logs = list_webhook_deliveries(db, property_id=property_id, limit=limit)
    return [WebhookDeliveryLogRead(**log) for log in logs]


# --- Snippet ---

@router.get("/properties/{property_id}/snippet", response_model=SnippetOutput)
def get_property_snippet(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> SnippetOutput:
    svc = PropertyService(db)
    prop = svc.get_property(current_user, property_id, org_id=org_id)
    
    # Find an active key prefix
    active_key = next((k for k in prop.api_keys if k.status == "active"), None)
    key_prefix = active_key.key_prefix if active_key else "zsk_live_pending"
    
    # Get active banner ID
    active_banner = svc.get_active_banner(current_user, property_id, org_id=org_id or prop.organization_id)
    banner_id = str(active_banner.banner_id) if active_banner else None
    
    return SnippetService().generate_snippet(prop, key_prefix, banner_id)


@router.post("/properties/{property_id}/snippet/email", status_code=status.HTTP_202_ACCEPTED)
def email_property_snippet(
    property_id: UUID,
    body: SnippetEmailRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    PropertyService(db).log_property_event(property_id, "developer_email_sent", {"email": body.email, "sent_by": str(current_user.id)})
    return {"status": "accepted", "message": f"Snippet emailed to {body.email}"}


@router.post("/properties/{property_id}/snippet/log-copy", status_code=status.HTTP_200_OK)
def log_snippet_copied(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    PropertyService(db).log_property_event(property_id, "snippet_copied", {"copied_by": str(current_user.id)})
    return {"status": "success"}

# --- Verification ---

@router.get("/properties/{property_id}/verifications", response_model=list[PropertyVerificationRead])
def list_verifications(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[PropertyVerificationRead]:
    return VerificationService(db).list_verifications(property_id)


@router.post("/properties/{property_id}/verify", response_model=PropertyVerificationRead)
async def trigger_verification(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> PropertyVerificationRead:
    return await VerificationService(db).trigger_verification(current_user, property_id)

# --- Coverage & Analytics ---

@router.get("/properties/{property_id}/coverage", response_model=PageCoverageScanRead | None)
def get_latest_coverage_scan(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> PageCoverageScanRead | None:
    scan = CoverageService(db).get_latest_scan(property_id)
    return PageCoverageScanRead.model_validate(scan) if scan else None


@router.post("/properties/{property_id}/coverage/scan", response_model=PageCoverageScanRead)
async def trigger_coverage_scan(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> PageCoverageScanRead:
    return await CoverageService(db).trigger_scan(current_user, property_id)


@router.get("/properties/{property_id}/coverage/history", response_model=list[PageCoverageScanRead])
def get_property_coverage_history(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> list[PageCoverageScanRead]:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    scans = CoverageService(db).list_scans(property_id)
    return [PageCoverageScanRead.model_validate(scan) for scan in scans]


@router.get("/properties/{property_id}/events", response_model=list[IntegrationEventRead])
def get_property_events(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    org_id: OrgIdQuery = None,
) -> list[IntegrationEventRead]:
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    events = db.query(IntegrationEvent).filter(
        IntegrationEvent.property_id == property_id
    ).order_by(desc(IntegrationEvent.created_at)).limit(limit).all()
    return [IntegrationEventRead.model_validate(e) for e in events]


@router.get("/properties/{property_id}/analytics", response_model=list[IntegrationAnalyticsDailyRead])
def get_property_analytics(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    days: int = Query(7, ge=1, le=90),
    banner_id: UUID | None = Query(None),
) -> list[IntegrationAnalyticsDailyRead]:
    return AnalyticsService(db).get_analytics(current_user, property_id, days, banner_id)


@router.get("/properties/{property_id}/analytics/banners", response_model=list[BannerRead])
def get_property_analytics_banners(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> list[BannerRead]:
    # Ensure property exists and user has access
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    
    # Query distinct banners associated with the property
    from app.models.property_banner_association import PropertyBannerAssociation
    from app.models.consent_banner import ConsentBanner
    
    banner_ids = (
        db.query(PropertyBannerAssociation.banner_id)
        .filter(PropertyBannerAssociation.property_id == property_id)
        .distinct()
        .all()
    )
    banner_ids = [b[0] for b in banner_ids]
    
    if not banner_ids:
        return []
        
    banners = (
        db.query(ConsentBanner)
        .filter(ConsentBanner.id.in_(banner_ids))
        .all()
    )
    return [BannerRead.model_validate(b) for b in banners]

# --- Cookie & Tracker Management ---

@router.post("/properties/{property_id}/cookie-scan", response_model=CookieScanJobRead)
def trigger_cookie_scan(
    property_id: UUID,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> CookieScanJobRead:
    job = TrackerService(db).trigger_scan(current_user, property_id, background_tasks)
    return CookieScanJobRead.model_validate(job)


@router.get("/properties/{property_id}/cookie-scan/status", response_model=CookieScanJobRead | None)
def get_cookie_scan_status(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> CookieScanJobRead | None:
    job = TrackerService(db).get_latest_scan(current_user, property_id)
    return CookieScanJobRead.model_validate(job) if job else None


@router.get("/properties/{property_id}/trackers", response_model=list[TrackerWithOverrideRead])
def list_property_trackers(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[TrackerWithOverrideRead]:
    trackers = TrackerService(db).list_trackers(current_user, property_id)
    return [TrackerWithOverrideRead.model_validate(t) for t in trackers]


@router.patch("/properties/{property_id}/trackers/{tracker_id}")
def update_tracker_override(
    property_id: UUID,
    tracker_id: UUID,
    body: TrackerOverrideUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> dict:
    return TrackerService(db).update_tracker(current_user, property_id, tracker_id, body)

# --- Global / Overview ---

@router.get("/overview-stats", response_model=IntegrationsOverviewStats)
def get_overview_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> IntegrationsOverviewStats:
    from app.services.property_service import PropertyService
    org_id = PropertyService(db)._resolve_org_id(current_user, org_id)
    
    # Active properties
    active_props = db.query(IntegrationProperty).filter(
        IntegrationProperty.organization_id == org_id,
        IntegrationProperty.status == "active"
    ).count()
    
    # Connected CMs (stub for now, always 0)
    connected_cms = 0
    
    # Events last 24h
    last_24h = datetime.now(timezone.utc) - timedelta(days=1)
    
    prop_ids_subquery = db.query(IntegrationProperty.id).filter(
        IntegrationProperty.organization_id == org_id
    ).subquery()
    
    events_24h = db.query(IntegrationEvent).filter(
        IntegrationEvent.property_id.in_(select(prop_ids_subquery)),
        IntegrationEvent.created_at >= last_24h
    ).count()
    
    # Cross-CM synced (stub)
    cross_cm_synced = 0
    
    return IntegrationsOverviewStats(
        active_integrations=active_props,
        connected_cms=connected_cms,
        events_24h=events_24h,
        cross_cm_synced=cross_cm_synced
    )


@router.get("/events", response_model=RecentActivityResponse)
def get_recent_activity(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = 10,
    org_id: UUID | None = Query(default=None),
) -> RecentActivityResponse:
    from app.services.property_service import PropertyService
    org_id = PropertyService(db)._resolve_org_id(current_user, org_id)
    
    prop_ids_subquery = db.query(IntegrationProperty.id).filter(
        IntegrationProperty.organization_id == org_id
    ).subquery()
    
    events = db.query(IntegrationEvent).filter(
        IntegrationEvent.property_id.in_(select(prop_ids_subquery))
    ).order_by(desc(IntegrationEvent.created_at)).limit(limit).all()
    
    results = []
    for e in events:
        # Determine status and text based on event type
        status = "success"
        if e.event_type == "consent_denied":
            status = "warning"
            
        action = None
        if e.event_type.startswith("consent"):
            text = f"{e.event_type.replace('_', ' ').capitalize()} recorded"
        elif e.event_type == "cmp_loaded":
            text = "Consent banner loaded"
        else:
            text = f"Event: {e.event_type}"
            
        # Format time ago
        now = datetime.now(timezone.utc)
        diff = now - e.created_at
        if diff.days > 0:
            time_str = f"{diff.days} days ago"
        elif diff.seconds >= 3600:
            time_str = f"{diff.seconds // 3600} hours ago"
        elif diff.seconds >= 60:
            time_str = f"{diff.seconds // 60} mins ago"
        else:
            time_str = "just now"
            
        results.append(RecentActivityEvent(
            id=e.id,
            status=status,
            text=text,
            source="Technical",
            time=time_str,
            action=action
        ))
        
    return RecentActivityResponse(events=results)


@router.get("/search-consent", response_model=ConsentSearchResponse)
def search_consent(
    query: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentSearchResponse:
    from app.services.property_service import PropertyService
    org_id = PropertyService(db)._resolve_org_id(current_user, org_id)
    
    # We'll search by session_id or exact ip_hash for now
    receipts = db.query(ConsentReceipt).join(IntegrationProperty).filter(
        ConsentReceipt.organization_id == org_id,
        or_(
            ConsentReceipt.session_id == query,
            ConsentReceipt.ip_hash == query
        )
    ).order_by(desc(ConsentReceipt.created_at)).limit(50).all()
    
    results = []
    for r in receipts:
        results.append(ConsentSearchTimelineEvent(
            id=r.id,
            property_id=r.property_id,
            property_domain=r.property.domain,
            session_id=r.session_id,
            event_type="consent_receipt",
            ip_hash=r.ip_hash[:8] + "...", # Mask slightly
            language=r.language,
            consented_purposes=r.consented_purposes,
            created_at=r.created_at
        ))
        
    return ConsentSearchResponse(results=results)


# --- Property Deployments (Multi-Target integrations) ---

@router.get("/properties/{property_id}/deployments", response_model=list[PropertyDeploymentRead])
def list_property_deployments(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> list[PropertyDeploymentRead]:
    from app.services.property_service import PropertyService
    from app.services.property_deployment_service import DeploymentService
    
    # Ensure user has access to property
    PropertyService(db).get_property(current_user, property_id, org_id=org_id)
    return DeploymentService(db).list_deployments(property_id)


@router.post("/properties/{property_id}/deployments", response_model=PropertyDeploymentRead, status_code=status.HTTP_201_CREATED)
def create_property_deployment(
    property_id: UUID,
    body: PropertyDeploymentCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> PropertyDeploymentRead:
    from app.services.property_deployment_service import DeploymentService
    return DeploymentService(db).create_deployment(property_id, current_user, body)


@router.get("/deployments/{deployment_id}", response_model=PropertyDeploymentRead)
def get_property_deployment(
    deployment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyDeploymentRead:
    from app.services.property_deployment_service import DeploymentService
    from app.services.property_service import PropertyService
    
    dep = DeploymentService(db).get_deployment(deployment_id)
    # Ensure user has access to property
    PropertyService(db).get_property(current_user, dep.property_id, org_id=org_id)
    return dep


@router.patch("/deployments/{deployment_id}", response_model=PropertyDeploymentRead)
def update_property_deployment(
    deployment_id: UUID,
    body: PropertyDeploymentUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyDeploymentRead:
    from app.services.property_deployment_service import DeploymentService
    from app.services.property_service import PropertyService
    
    # Check access before edit
    dep = DeploymentService(db).get_deployment(deployment_id)
    PropertyService(db).get_property(current_user, dep.property_id, org_id=org_id)
    
    return DeploymentService(db).update_deployment(deployment_id, current_user, body)


@router.get("/deployments/{deployment_id}/versions", response_model=list[DeploymentConfigurationVersionRead])
def list_deployment_versions(
    deployment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> list[DeploymentConfigurationVersionRead]:
    from app.services.property_deployment_service import DeploymentService
    from app.services.property_service import PropertyService
    
    dep = DeploymentService(db).get_deployment(deployment_id)
    PropertyService(db).get_property(current_user, dep.property_id, org_id=org_id)
    
    return DeploymentService(db).list_versions(deployment_id)


@router.post("/deployments/{deployment_id}/publish/{version_id}", response_model=PropertyDeploymentRead)
def publish_deployment_version(
    deployment_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: OrgIdQuery = None,
) -> PropertyDeploymentRead:
    from app.services.property_deployment_service import DeploymentService
    from app.services.property_service import PropertyService
    
    dep = DeploymentService(db).get_deployment(deployment_id)
    PropertyService(db).get_property(current_user, dep.property_id, org_id=org_id)
    
    return DeploymentService(db).publish_version(deployment_id, current_user, version_id)
