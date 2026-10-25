from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.regulatory_proceeding import (
    RegulatoryCorrespondenceEntry,
    RegulatoryProceedingCreate,
    RegulatoryProceedingRead,
    RegulatoryProceedingSummary,
    RegulatoryProceedingUpdate,
)
from app.services.regulatory_proceeding_service import RegulatoryProceedingService

router = APIRouter(prefix="/regulatory-proceedings", tags=["regulatory-proceedings"])


@router.get("", response_model=list[RegulatoryProceedingRead])
def list_regulatory_proceedings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RegulatoryProceedingRead]:
    return RegulatoryProceedingService(db).list_proceedings(current_user, org_id=org_id)


@router.get("/summary", response_model=RegulatoryProceedingSummary)
def regulatory_proceedings_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryProceedingSummary:
    return RegulatoryProceedingService(db).get_summary(current_user, org_id=org_id)


@router.get("/export")
def export_regulatory_proceedings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PlainTextResponse:
    csv_data = RegulatoryProceedingService(db).export_csv(current_user, org_id=org_id)
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="regulatory-proceedings-register.csv"'},
    )


@router.post("", response_model=RegulatoryProceedingRead, status_code=status.HTTP_201_CREATED)
def create_regulatory_proceeding(
    body: RegulatoryProceedingCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryProceedingRead:
    return RegulatoryProceedingService(db).create(current_user, body, org_id=org_id)


@router.patch("/{proceeding_id}", response_model=RegulatoryProceedingRead)
def update_regulatory_proceeding(
    proceeding_id: UUID,
    body: RegulatoryProceedingUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryProceedingRead:
    return RegulatoryProceedingService(db).update(
        current_user, proceeding_id, body, org_id=org_id
    )


@router.post("/{proceeding_id}/correspondence", response_model=RegulatoryProceedingRead)
def add_regulatory_correspondence(
    proceeding_id: UUID,
    body: RegulatoryCorrespondenceEntry,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryProceedingRead:
    return RegulatoryProceedingService(db).add_correspondence(
        current_user, proceeding_id, body, org_id=org_id
    )


@router.post("/{proceeding_id}/assemble-evidence", response_model=RegulatoryProceedingRead)
def assemble_regulatory_evidence_pack(
    proceeding_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryProceedingRead:
    return RegulatoryProceedingService(db).assemble_evidence_pack(
        current_user, proceeding_id, org_id=org_id
    )
