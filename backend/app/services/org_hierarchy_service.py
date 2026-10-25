"""Org-wide business unit hierarchy — canonical API over RoPA tables."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.ropa import BusinessUnit, Department
from app.models.user import User
from app.schemas.ropa import BusinessUnitCreate, DepartmentCreate
from app.services.compliance_base import ComplianceBaseService
from app.services.ropa_service import RopaService


class OrgHierarchyService(ComplianceBaseService):
    """Single entry point for business unit / department hierarchy."""

    def __init__(self, db: Session):
        super().__init__(db)
        self._ropa = RopaService(db)

    def list_business_units(self, user: User, org_id: UUID | None = None) -> list[BusinessUnit]:
        return self._ropa.list_business_units(user, org_id=org_id)

    def create_business_unit(
        self, user: User, payload: BusinessUnitCreate, org_id: UUID | None = None
    ) -> BusinessUnit:
        self._require_admin(user)
        return self._ropa.create_business_unit(user, payload, org_id=org_id)

    def list_departments(self, user: User, org_id: UUID | None = None) -> list[Department]:
        return self._ropa.list_departments(user, org_id=org_id)

    def create_department(
        self, user: User, payload: DepartmentCreate, org_id: UUID | None = None
    ) -> Department:
        self._require_admin(user)
        return self._ropa.create_department(user, payload, org_id=org_id)

    def get_business_unit_name(self, business_unit_id: UUID | None) -> str | None:
        if not business_unit_id:
            return None
        bu = self.db.get(BusinessUnit, business_unit_id)
        return bu.name if bu else None
