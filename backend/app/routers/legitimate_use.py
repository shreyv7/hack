from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.legitimate_use import (
    LegitimateUseCreate,
    LegitimateUseMarkReviewed,
    LegitimateUseRead,
    LegitimateUseSummary,
    LegitimateUseUpdate,
)
from app.services.legitimate_use_service import LegitimateUseService

router = APIRouter(prefix="/legitimate-use", tags=["legitimate-use"])


@router.get("", response_model=list[LegitimateUseRead])
def list_legitimate_use_records(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[LegitimateUseRead]:
    return LegitimateUseService(db).list_records(current_user, org_id=org_id)


@router.get("/summary", response_model=LegitimateUseSummary)
def legitimate_use_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> LegitimateUseSummary:
    return LegitimateUseService(db).get_summary(current_user, org_id=org_id)


@router.get("/export")
def export_legitimate_use_records(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PlainTextResponse:
    csv_data = LegitimateUseService(db).export_csv(current_user, org_id=org_id)
    return PlainTextResponse(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="legitimate-use-register.csv"'},
    )


@router.post("", response_model=LegitimateUseRead, status_code=status.HTTP_201_CREATED)
def create_legitimate_use_record(
    body: LegitimateUseCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> LegitimateUseRead:
    return LegitimateUseService(db).create(current_user, body, org_id=org_id)


@router.patch("/{record_id}", response_model=LegitimateUseRead)
def update_legitimate_use_record(
    record_id: UUID,
    body: LegitimateUseUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> LegitimateUseRead:
    return LegitimateUseService(db).update(current_user, record_id, body, org_id=org_id)


@router.post("/{record_id}/mark-reviewed", response_model=LegitimateUseRead)
def mark_legitimate_use_reviewed(
    record_id: UUID,
    body: LegitimateUseMarkReviewed,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> LegitimateUseRead:
    return LegitimateUseService(db).mark_reviewed(current_user, record_id, body, org_id=org_id)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_legitimate_use_record(
    record_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    LegitimateUseService(db).delete(current_user, record_id, org_id=org_id)
