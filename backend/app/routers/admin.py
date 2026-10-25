from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.organization import (
    OrganizationCreate,
    OrganizationRead,
    OrganizationUpdate,
    OrganizationWithAdminResponse,
)
from app.schemas.user import UserRead
from app.services.organization_service import OrganizationService

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/organizations", response_model=list[OrganizationRead])
def list_organizations(
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> list[OrganizationRead]:
    orgs = OrganizationService(db).list_all()
    return [OrganizationRead.model_validate(o) for o in orgs]


@router.post("/organizations", response_model=OrganizationWithAdminResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrganizationCreate,
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> OrganizationWithAdminResponse:
    return OrganizationService(db).create_with_admin(body)


@router.patch("/organizations/{org_id}", response_model=OrganizationRead)
def update_organization(
    org_id: UUID,
    body: OrganizationUpdate,
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> OrganizationRead:
    org = OrganizationService(db).update(org_id, body)
    return OrganizationRead.model_validate(org)


@router.delete("/organizations/{org_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_organization(
    org_id: UUID,
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> Response:
    OrganizationService(db).delete(org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/users", response_model=list[UserRead])
def list_all_users(
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[User]:
    users = OrganizationService(db).list_users(org_id=org_id)
    return [UserRead.model_validate(u) for u in users]


# --- Self-service signup approvals -------------------------------------------
@router.get("/signups", response_model=list[UserRead])
def list_pending_signups(
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> list[User]:
    return OrganizationService(db).list_pending_signups()


@router.post("/signups/{user_id}/approve", response_model=UserRead)
def approve_signup(
    user_id: UUID,
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> User:
    return OrganizationService(db).approve_signup(user_id)


@router.post("/signups/{user_id}/reject", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def reject_signup(
    user_id: UUID,
    _current_user: Annotated[User, Depends(require_role(UserRole.superadmin))],
    db: Session = Depends(get_db),
) -> Response:
    OrganizationService(db).reject_signup(user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
