from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole, UserStatus
from app.schemas.organization import OrganizationCreate, OrganizationRead, OrganizationUpdate, OrganizationWithAdminResponse
from app.schemas.user import UserRead
from app.services.email_service import send_invite_safe, send_signup_approved_safe
from app.utils.passwords import generate_temp_password
from app.utils.workspace_defaults import create_default_organization_settings


class OrganizationService:
    def __init__(self, db: Session):
        self.db = db

    def list_all(self) -> list[Organization]:
        return self.db.query(Organization).order_by(Organization.name).all()

    def get(self, org_id: UUID) -> Organization:
        org = self.db.get(Organization, org_id)
        if org is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Organization not found")
        return org

    def create_with_admin(self, body: OrganizationCreate) -> OrganizationWithAdminResponse:
        temp_password = generate_temp_password()
        try:
            org = Organization(
                name=body.org_name,
                slug=body.slug,
                status=OrganizationStatus.active,
            )
            self.db.add(org)
            self.db.flush()
            self.db.add(create_default_organization_settings(org.id))

            admin = User(
                organization_id=org.id,
                email=body.admin_email.lower(),
                password_hash=hash_password(temp_password),
                full_name=body.admin_full_name,
                role=UserRole.admin,
                status=UserStatus.invited,
                must_change_password=True,
            )
            self.db.add(admin)
            self.db.commit()
            self.db.refresh(org)
            self.db.refresh(admin)
        except IntegrityError as exc:
            self.db.rollback()
            if "email" in str(exc).lower() or "users_email" in str(exc):
                raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered") from exc
            if "slug" in str(exc).lower():
                raise HTTPException(status.HTTP_409_CONFLICT, detail="Organization slug already exists") from exc
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Could not create organization") from exc

        email_sent = send_invite_safe(admin.email, admin.full_name, temp_password)
        return OrganizationWithAdminResponse(
            organization=OrganizationRead.model_validate(org),
            admin_user=UserRead.model_validate(admin),
            invite_email_sent=email_sent,
        )

    def update(self, org_id: UUID, body: OrganizationUpdate) -> Organization:
        org = self.get(org_id)
        if body.name is not None:
            org.name = body.name
        if body.status is not None:
            org.status = body.status
        self.db.commit()
        self.db.refresh(org)
        return org

    def delete(self, org_id: UUID) -> None:
        org = self.get(org_id)
        self.db.delete(org)
        self.db.commit()

    def list_users(self, org_id: UUID | None = None) -> list[User]:
        query = self.db.query(User)
        if org_id is not None:
            query = query.filter(User.organization_id == org_id)
        return query.order_by(User.email).all()

    # --- Self-service signup approval (superadmin) ---------------------------
    def list_pending_signups(self) -> list[User]:
        return (
            self.db.query(User)
            .filter(User.status == UserStatus.pending_approval)
            .order_by(User.created_at)
            .all()
        )

    def _get_pending_signup(self, user_id: UUID) -> User:
        user = self.db.get(User, user_id)
        if user is None or user.status != UserStatus.pending_approval:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Pending signup not found")
        return user

    def approve_signup(self, user_id: UUID) -> User:
        user = self._get_pending_signup(user_id)
        user.status = UserStatus.active
        if user.organization_id is not None:
            org = self.db.get(Organization, user.organization_id)
            if org is not None and org.status == OrganizationStatus.pending:
                org.status = OrganizationStatus.active
        self.db.commit()
        self.db.refresh(user)
        send_signup_approved_safe(user.email, user.full_name)
        return user

    def reject_signup(self, user_id: UUID) -> None:
        """Reject a pending signup. Removes the pending org (cascades to the user)."""
        user = self._get_pending_signup(user_id)
        org = self.db.get(Organization, user.organization_id) if user.organization_id else None
        if org is not None and org.status == OrganizationStatus.pending:
            self.db.delete(org)  # FK cascade removes the pending admin user too
        else:
            self.db.delete(user)
        self.db.commit()
