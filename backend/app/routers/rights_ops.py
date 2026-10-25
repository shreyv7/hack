from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.rights_ops import RightsOpsDashboard, RightsOpsEscalate, RightsOpsRequestRead
from app.services.rights_ops_service import RightsOpsService

router = APIRouter(prefix="/rights-ops", tags=["rights-ops"])


@router.get("/grievances/queue", response_model=list[RightsOpsRequestRead])
def grievance_queue(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RightsOpsRequestRead]:
    return RightsOpsService(db).grievance_queue(current_user, org_id=org_id)


@router.get("/grievances/dashboard", response_model=RightsOpsDashboard)
def grievance_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RightsOpsDashboard:
    return RightsOpsService(db).grievance_dashboard(current_user, org_id=org_id)


@router.post("/grievances/{request_id}/escalate", response_model=RightsOpsRequestRead)
def escalate_grievance(
    request_id: UUID,
    body: RightsOpsEscalate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RightsOpsRequestRead:
    return RightsOpsService(db).escalate_grievance(
        current_user, request_id, body, org_id=org_id
    )


@router.get("/nominations/queue", response_model=list[RightsOpsRequestRead])
def nomination_queue(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RightsOpsRequestRead]:
    return RightsOpsService(db).nomination_queue(current_user, org_id=org_id)


@router.get("/nominations/dashboard", response_model=RightsOpsDashboard)
def nomination_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RightsOpsDashboard:
    return RightsOpsService(db).nomination_dashboard(current_user, org_id=org_id)


@router.post("/nominations/{request_id}/escalate", response_model=RightsOpsRequestRead)
def escalate_nomination(
    request_id: UUID,
    body: RightsOpsEscalate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RightsOpsRequestRead:
    return RightsOpsService(db).escalate_nomination(
        current_user, request_id, body, org_id=org_id
    )
