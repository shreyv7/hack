from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.dsar import (
    DataRightType,
    DataRightsActivityAction,
    DataRightsRequestStatus,
)
from app.models.user import User, UserRole
from app.schemas.dsar import (
    DataRightsRequestBatchResult,
    DataRightsRequestBatchUpdate,
    DataRightsRequestRead,
    DataRightsRequestResolve,
    DataRightsRequestUpdate,
    DsarCommentCreate,
    DsarActivityLogRead,
    DsarDashboardRead,
    OtpVerifyRequest,
    OtpVerifyResponse,
    PortalBrandingRead,
    PortalFormSchema,
    PortalFormUpdate,
    PortalFormsRead,
    PortalRequestCreate,
    PortalRequestCreated,
    SlaEngineRunResult,
    StatusCheckRequest,
    StatusCheckResponse,
)
from app.services.dsar_service import DsarService

router = APIRouter(prefix="/dsar", tags=["dsar"])


@router.get("/portal/{org_slug}/branding", response_model=PortalBrandingRead)
def get_portal_branding(org_slug: str, db: Session = Depends(get_db)) -> PortalBrandingRead:
    return DsarService(db).get_portal_branding(org_slug)


@router.get("/portal/{org_slug}/forms/{right_type}", response_model=PortalFormSchema)
def get_portal_form_public(
    org_slug: str,
    right_type: DataRightType,
    db: Session = Depends(get_db),
) -> PortalFormSchema:
    return DsarService(db).get_portal_form_public(org_slug, right_type)


@router.get("/portal-forms", response_model=PortalFormsRead)
def list_portal_forms(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PortalFormsRead:
    return DsarService(db).list_portal_forms(current_user, org_id=org_id)


@router.put("/portal-forms/{right_type}", response_model=PortalFormSchema)
def update_portal_form(
    right_type: DataRightType,
    body: PortalFormUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PortalFormSchema:
    return DsarService(db).update_portal_form(
        current_user, right_type, body, org_id=org_id
    )


@router.post(
    "/portal/{org_slug}/requests",
    response_model=PortalRequestCreated,
    status_code=201,
)
def create_portal_request(
    org_slug: str,
    body: PortalRequestCreate,
    db: Session = Depends(get_db),
) -> PortalRequestCreated:
    return DsarService(db).create_portal_request(org_slug, body)


@router.post(
    "/portal/{org_slug}/requests/{tracking_id}/verify-otp",
    response_model=OtpVerifyResponse,
)
def verify_portal_otp(
    org_slug: str,
    tracking_id: str,
    body: OtpVerifyRequest,
    db: Session = Depends(get_db),
) -> OtpVerifyResponse:
    svc = DsarService(db)
    verified, message = svc.verify_otp(
        org_slug,
        tracking_id,
        body.otp_code,
        email=str(body.email) if body.email else None,
        phone=body.phone,
    )
    status_resp = svc.status_check(
        org_slug,
        tracking_id,
        email=str(body.email) if body.email else None,
        phone=body.phone,
    )
    return OtpVerifyResponse(
        verified=verified,
        tracking_id=tracking_id,
        status=status_resp.status,
        message=message,
    )


@router.post(
    "/portal/{org_slug}/requests/{tracking_id}/resend-otp",
)
def resend_portal_otp(
    org_slug: str,
    tracking_id: str,
    body: StatusCheckRequest,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    message = DsarService(db).resend_otp(
        org_slug,
        tracking_id,
        email=str(body.email) if body.email else None,
        phone=body.phone,
    )
    return {"message": message}


@router.post(
    "/portal/{org_slug}/requests/{tracking_id}/status-check",
    response_model=StatusCheckResponse,
)
def portal_status_check(
    org_slug: str,
    tracking_id: str,
    body: StatusCheckRequest,
    db: Session = Depends(get_db),
) -> StatusCheckResponse:
    return DsarService(db).status_check(
        org_slug,
        tracking_id,
        email=str(body.email) if body.email else None,
        phone=body.phone,
    )


@router.get("/requests/{request_id}", response_model=DataRightsRequestRead)
def get_dsar_request(
    request_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestRead:
    return DsarService(db).get_request(current_user, request_id, org_id=org_id)


@router.get("/dashboard", response_model=DsarDashboardRead)
def get_dsar_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    status_filter: DataRightsRequestStatus | None = Query(default=None, alias="status"),
    right_type: DataRightType | None = Query(default=None),
) -> DsarDashboardRead:
    return DsarService(db).get_dashboard(
        current_user,
        org_id=org_id,
        status_filter=status_filter,
        right_type=right_type,
    )


@router.patch("/requests/{request_id}", response_model=DataRightsRequestRead)
def update_dsar_request(
    request_id: UUID,
    body: DataRightsRequestUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestRead:
    return DsarService(db).update_request(current_user, request_id, body, org_id=org_id)


@router.post("/requests/batch-update", response_model=DataRightsRequestBatchResult)
def batch_update_dsar_requests(
    body: DataRightsRequestBatchUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestBatchResult:
    return DsarService(db).batch_update_requests(current_user, body, org_id=org_id)


@router.post("/requests/{request_id}/legal-signoff", response_model=DataRightsRequestRead)
def legal_signoff_dsar_request(
    request_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestRead:
    return DsarService(db).legal_signoff_request(current_user, request_id, org_id=org_id)


@router.post("/requests/{request_id}/resolve", response_model=DataRightsRequestRead)
def resolve_dsar_request(
    request_id: UUID,
    body: DataRightsRequestResolve,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestRead:
    return DsarService(db).resolve_request(
        current_user, request_id, body.closure_notes, org_id=org_id
    )


@router.post("/requests/{request_id}/comments", response_model=DataRightsRequestRead)
def add_dsar_request_comment(
    request_id: UUID,
    body: DsarCommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataRightsRequestRead:
    return DsarService(db).add_request_comment(
        current_user, request_id, body.message, org_id=org_id
    )


@router.get("/activity-log", response_model=DsarActivityLogRead)
def get_dsar_activity_log(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    tracking_id: str | None = Query(default=None),
    action: DataRightsActivityAction | None = Query(default=None),
    right_type: DataRightType | None = Query(default=None),
    actor: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> DsarActivityLogRead:
    return DsarService(db).get_activity_log(
        current_user,
        org_id=org_id,
        tracking_id=tracking_id,
        action=action,
        right_type=right_type,
        actor=actor,
        limit=limit,
        offset=offset,
    )


@router.post("/admin/sla/run-once", response_model=SlaEngineRunResult)
def run_sla_engine_once(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> SlaEngineRunResult:
    return DsarService(db).run_sla_engine_once()
