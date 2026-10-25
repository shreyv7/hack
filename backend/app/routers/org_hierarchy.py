"""Org-wide hierarchy API (business units, departments)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.ropa import BusinessUnitCreate, BusinessUnitRead, DepartmentCreate, DepartmentRead
from app.services.org_hierarchy_service import OrgHierarchyService

router = APIRouter(prefix="/org", tags=["org-hierarchy"])


@router.get("/business-units", response_model=list[BusinessUnitRead])
def list_business_units(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[BusinessUnitRead]:
    return OrgHierarchyService(db).list_business_units(current_user, org_id=org_id)


@router.post("/business-units", response_model=BusinessUnitRead)
def create_business_unit(
    payload: BusinessUnitCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BusinessUnitRead:
    return OrgHierarchyService(db).create_business_unit(current_user, payload, org_id=org_id)


@router.get("/departments", response_model=list[DepartmentRead])
def list_departments(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DepartmentRead]:
    return OrgHierarchyService(db).list_departments(current_user, org_id=org_id)


@router.post("/departments", response_model=DepartmentRead)
def create_department(
    payload: DepartmentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DepartmentRead:
    return OrgHierarchyService(db).create_department(current_user, payload, org_id=org_id)
