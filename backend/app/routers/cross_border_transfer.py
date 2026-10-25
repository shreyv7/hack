from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status, Response, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.cross_border_transfer import (
    CbtTransferCreate,
    CbtTransferUpdate,
    CbtTransferRead,
    CbtContractCreate,
    CbtContractRead,
    CbtContractDetailRead,
    CbtContractVersionRead,
    CbtSdfAssessmentCreate,
    CbtSdfAssessmentRead,
    CbtActivityRead,
    CbtDashboardKpis,
)
from app.services.cbt_service import CbtService
from app.schemas.notice_delivery import NoticeCampaignRead

router = APIRouter(prefix="/cbt", tags=["Cross-Border Transfer"])


def _resolve_org_id(user: User, org_id: UUID | None) -> UUID:
    if user.role == UserRole.superadmin and org_id:
        return org_id
    if not user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no associated organization",
        )
    return user.organization_id


@router.get("/dashboard", response_model=CbtDashboardKpis)
def get_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtDashboardKpis:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).get_dashboard_kpis(resolved_org_id)


@router.get("/transfers", response_model=list[CbtTransferRead])
def list_transfers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[CbtTransferRead]:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).list_transfers(resolved_org_id)


@router.post("/transfers", response_model=CbtTransferRead, status_code=status.HTTP_201_CREATED)
def create_transfer(
    payload: CbtTransferCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtTransferRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).create_transfer(resolved_org_id, current_user, payload)


@router.get("/transfers/{transfer_id}", response_model=CbtTransferRead)
def get_transfer(
    transfer_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtTransferRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).get_transfer(resolved_org_id, transfer_id)


@router.patch("/transfers/{transfer_id}", response_model=CbtTransferRead)
def update_transfer(
    transfer_id: UUID,
    payload: CbtTransferUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtTransferRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).update_transfer(resolved_org_id, current_user, transfer_id, payload)


@router.delete("/transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transfer(
    transfer_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    resolved_org_id = _resolve_org_id(current_user, org_id)
    CbtService(db).delete_transfer(resolved_org_id, current_user, transfer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Contracts Endpoints ---

@router.get("/transfers/{transfer_id}/contracts", response_model=list[CbtContractRead])
def list_contracts(
    transfer_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[CbtContractRead]:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).list_contracts(resolved_org_id, transfer_id)


@router.post("/transfers/{transfer_id}/contracts", response_model=CbtContractRead, status_code=status.HTTP_201_CREATED)
def create_contract(
    transfer_id: UUID,
    payload: CbtContractCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtContractRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).create_contract(resolved_org_id, current_user, transfer_id, payload)


@router.get("/contracts/{contract_id}", response_model=CbtContractDetailRead)
def get_contract(
    contract_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtContractDetailRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).get_contract(resolved_org_id, contract_id)


@router.post("/contracts/{contract_id}/versions", response_model=CbtContractVersionRead, status_code=status.HTTP_201_CREATED)
def add_contract_version(
    contract_id: UUID,
    payload: CbtContractCreate,  # Reusing title/content/summary input model
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtContractVersionRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).add_contract_version(
        resolved_org_id, current_user, contract_id, payload.content, payload.summary
    )


@router.post("/contracts/{contract_id}/sign/{version_id}", response_model=CbtContractRead)
def sign_contract(
    contract_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtContractRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).sign_contract(resolved_org_id, current_user, contract_id, version_id)


@router.get("/contracts/{contract_id}/versions/{version_id}/pdf")
def export_contract_pdf(
    contract_id: UUID,
    version_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    resolved_org_id = _resolve_org_id(current_user, org_id)
    pdf_buffer = CbtService(db).export_contract_to_pdf(resolved_org_id, contract_id, version_id)
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=cbt_contract_{contract_id}.pdf"},
    )


# --- Notices Endpoints ---

@router.post("/transfers/{transfer_id}/notices", response_model=NoticeCampaignRead, status_code=status.HTTP_201_CREATED)
def trigger_notice_campaign(
    transfer_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> NoticeCampaignRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).trigger_notice_campaign(resolved_org_id, current_user, transfer_id)


# --- SDF Assessment Endpoints ---

@router.post("/transfers/{transfer_id}/sdf-assessments", response_model=CbtSdfAssessmentRead, status_code=status.HTTP_201_CREATED)
def create_sdf_assessment(
    transfer_id: UUID,
    payload: CbtSdfAssessmentCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CbtSdfAssessmentRead:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).create_sdf_assessment(resolved_org_id, current_user, transfer_id, payload)


@router.get("/transfers/{transfer_id}/sdf-assessments", response_model=list[CbtSdfAssessmentRead])
def list_sdf_assessments(
    transfer_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[CbtSdfAssessmentRead]:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).list_sdf_assessments(resolved_org_id, transfer_id)


# --- Activity Log Endpoints ---

@router.get("/activities", response_model=list[CbtActivityRead])
def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    transfer_id: UUID | None = Query(default=None),
) -> list[CbtActivityRead]:
    resolved_org_id = _resolve_org_id(current_user, org_id)
    return CbtService(db).list_activities(resolved_org_id, transfer_id)
