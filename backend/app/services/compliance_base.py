"""Shared org resolution for compliance services."""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.rbac import Permission, has_permission
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole


class ComplianceBaseService:
    def __init__(self, db: Session):
        self.db = db

    def _ensure_org_accessible(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        if org.status not in (OrganizationStatus.active, OrganizationStatus.pending):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is not active")
        return org

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Compliance operations require an organization context",
                )
            self._ensure_org_accessible(org_id)
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Compliance operations require an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        self._ensure_org_accessible(user.organization_id)
        return user.organization_id

    def _require_admin(self, user: User) -> None:
        """Legacy shim — prefer require_permission() in routers."""
        if not has_permission(user, Permission.COMPLIANCE_MANAGE) and user.role not in (
            UserRole.admin,
            UserRole.superadmin,
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Admin access required")

    def _require_permission(self, user: User, *permissions: Permission) -> None:
        if not any(has_permission(user, p) for p in permissions):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
