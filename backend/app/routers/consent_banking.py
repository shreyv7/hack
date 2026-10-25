"""Banking industry consent configuration and principal registry APIs."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.rbac import Permission, require_permission
from app.models.integration_property import IntegrationProperty
from app.models.user import User, UserRole
from app.schemas.consent_banking import (
    ConsentIndustryConfigRead,
    ConsentIndustryConfigUpdate,
    ConsentPrincipalDetail,
    ConsentPrincipalSummary,
)
from app.schemas.consent_capture_session import (
    ConsentCaptureOtpVerify,
    ConsentCaptureSessionCreate,
    ConsentCaptureSessionRead,
)
from app.services.consent_banking_service import ConsentBankingService
from app.services.consent_capture_session_service import ConsentCaptureSessionService

router = APIRouter(prefix="/consent/banking", tags=["consent-banking"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]
AssistedCaptureUser = Annotated[
    User,
    Depends(require_permission(Permission.CONSENT_CAPTURE_ASSISTED, Permission.CONSENT_WRITE)),
]


def _resolve_property(db: Session, user: User, property_id: UUID, org_id: UUID | None = None) -> IntegrationProperty:
    svc = ConsentBankingService(db)
    resolved_org = svc.resolve_org_id(user, org_id)
    prop = db.get(IntegrationProperty, property_id)
    if prop is None or prop.organization_id != resolved_org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    return prop


@router.get("/config", response_model=ConsentIndustryConfigRead)
def get_banking_config(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentIndustryConfigRead:
    return ConsentBankingService(db).get_config(current_user, org_id=org_id)


@router.patch("/config", response_model=ConsentIndustryConfigRead)
def update_banking_config(
    body: ConsentIndustryConfigUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentIndustryConfigRead:
    return ConsentBankingService(db).update_config(current_user, body, org_id=org_id)


@router.get("/principals", response_model=list[ConsentPrincipalSummary])
def list_principals(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[ConsentPrincipalSummary]:
    return ConsentBankingService(db).list_principals(
        current_user, org_id=org_id, search=search, limit=limit
    )


@router.get("/principals/{principal_id}", response_model=ConsentPrincipalDetail)
def get_principal(
    principal_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentPrincipalDetail:
    return ConsentBankingService(db).get_principal(current_user, principal_id, org_id=org_id)


@router.get("/enabled")
def banking_enabled(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    svc = ConsentBankingService(db)
    resolved = svc.resolve_org_id(current_user, org_id)
    return {"enabled": svc.is_banking_enabled(resolved)}


@router.post("/sessions", response_model=ConsentCaptureSessionRead, status_code=status.HTTP_201_CREATED)
def create_assisted_session(
    body: ConsentCaptureSessionCreate,
    current_user: AssistedCaptureUser,
    db: Session = Depends(get_db),
    property_id: UUID = Query(...),
    org_id: UUID | None = Query(default=None),
) -> ConsentCaptureSessionRead:
    prop = _resolve_property(db, current_user, property_id, org_id)
    return ConsentCaptureSessionService(db).create_session(
        prop, body, ip_hash="teller-ui", user_agent="ZeroShield-Teller-UI"
    )


@router.post("/sessions/{session_id}/verify-otp", response_model=ConsentCaptureSessionRead)
def verify_assisted_otp(
    session_id: UUID,
    body: ConsentCaptureOtpVerify,
    current_user: AssistedCaptureUser,
    db: Session = Depends(get_db),
    property_id: UUID = Query(...),
    org_id: UUID | None = Query(default=None),
) -> ConsentCaptureSessionRead:
    prop = _resolve_property(db, current_user, property_id, org_id)
    return ConsentCaptureSessionService(db).verify_otp(
        prop,
        session_id,
        body.otp_code,
        auto_complete=body.auto_complete,
        ip_hash="teller-ui",
        user_agent="ZeroShield-Teller-UI",
    )


@router.post("/sessions/{session_id}/resend-otp", response_model=ConsentCaptureSessionRead)
def resend_assisted_otp(
    session_id: UUID,
    current_user: AssistedCaptureUser,
    db: Session = Depends(get_db),
    property_id: UUID = Query(...),
    org_id: UUID | None = Query(default=None),
) -> ConsentCaptureSessionRead:
    prop = _resolve_property(db, current_user, property_id, org_id)
    return ConsentCaptureSessionService(db).resend_otp(
        prop, session_id, ip_hash="teller-ui", user_agent="ZeroShield-Teller-UI"
    )


@router.post("/sessions/{session_id}/complete", response_model=ConsentCaptureSessionRead)
def complete_assisted_session(
    session_id: UUID,
    current_user: AssistedCaptureUser,
    db: Session = Depends(get_db),
    property_id: UUID = Query(...),
    org_id: UUID | None = Query(default=None),
) -> ConsentCaptureSessionRead:
    prop = _resolve_property(db, current_user, property_id, org_id)
    return ConsentCaptureSessionService(db).complete_session(
        prop, session_id, ip_hash="teller-ui", user_agent="ZeroShield-Teller-UI"
    )
