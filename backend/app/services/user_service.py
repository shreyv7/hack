from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.core.rbac import INVITABLE_ROLES
from app.models.user import User, UserRole, UserStatus
from app.models.user_scope_assignment import UserScopeAssignment
from app.schemas.user import UserInvite, UserRead, UserUpdate, UserScopeAssignmentCreate
from app.services.email_service import send_invite_safe
from app.utils.passwords import generate_temp_password


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def _reject_superadmin_assignment(self, role: UserRole) -> None:
        if role == UserRole.superadmin:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Cannot assign superadmin role",
            )

    def _ensure_same_org(self, actor: User, target: User) -> None:
        if actor.role == UserRole.superadmin:
            return
        if target.organization_id != actor.organization_id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")

    def _count_admins_in_org(self, organization_id: UUID, exclude_user_id: UUID | None = None) -> int:
        query = self.db.query(User).filter(
            User.organization_id == organization_id,
            User.role == UserRole.admin,
            User.status != UserStatus.disabled,
        )
        if exclude_user_id is not None:
            query = query.filter(User.id != exclude_user_id)
        return query.count()

    def _ensure_not_last_admin(
        self,
        target: User,
        *,
        demoting: bool = False,
        deleting: bool = False,
        disabling: bool = False,
    ) -> None:
        if target.role != UserRole.admin or target.organization_id is None:
            return
        if not (demoting or deleting or disabling):
            return
        # Count the OTHER active admins in this org (exclude the target itself).
        remaining = self._count_admins_in_org(
            target.organization_id,
            exclude_user_id=target.id,
        )
        if remaining < 1:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove, demote, or disable the only admin in this organization",
            )

    def list_users(
        self, actor: User, org_id: UUID | None = None, role: UserRole | None = None
    ) -> list[User]:
        query = self.db.query(User)
        if actor.role == UserRole.superadmin:
            if org_id is not None:
                query = query.filter(User.organization_id == org_id)
        else:
            query = query.filter(User.organization_id == actor.organization_id)
        if role is not None:
            query = query.filter(User.role == role)
        return query.order_by(User.email).all()

    def get_user(self, actor: User, user_id: UUID) -> User:
        target = self.db.get(User, user_id)
        if target is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found")
        self._ensure_same_org(actor, target)
        return target

    def invite(self, actor: User, body: UserInvite, org_id: UUID | None = None) -> User:
        self._reject_superadmin_assignment(body.role)
        if body.role not in INVITABLE_ROLES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid role for invite")

        if actor.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail="org_id query parameter is required when inviting as superadmin",
                )
            target_org_id = org_id
        else:
            target_org_id = actor.organization_id
            if org_id is not None and org_id != actor.organization_id:
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Cannot invite users to another organization")

        if target_org_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Organization context required")

        temp_password = generate_temp_password()
        user = User(
            organization_id=target_org_id,
            email=body.email.lower(),
            password_hash=hash_password(temp_password),
            full_name=body.full_name,
            role=body.role,
            status=UserStatus.invited,
            must_change_password=True,
        )
        try:
            self.db.add(user)
            self.db.commit()
            self.db.refresh(user)
        except IntegrityError as exc:
            self.db.rollback()
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Email already registered") from exc

        send_invite_safe(user.email, user.full_name, temp_password)
        from app.services.notification_service import NotificationCategory, create_notification

        create_notification(
            self.db,
            organization_id=target_org_id,
            recipient_id=user.id,
            title="Welcome to DPDPA Shield",
            message="Your account has been created. Check your email for login credentials and change your password on first sign-in.",
            category=NotificationCategory.system,
            action_url="/dashboard",
        )
        self.db.commit()
        return user

    def update_user(self, actor: User, user_id: UUID, body: UserUpdate) -> User:
        target = self.get_user(actor, user_id)

        if body.role is not None:
            self._reject_superadmin_assignment(body.role)
            if target.role == UserRole.admin and body.role == UserRole.user:
                self._ensure_not_last_admin(target, demoting=True)
            if actor.id == target.id and body.role != target.role:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Cannot change your own role",
                )
            target.role = body.role

        if body.status is not None:
            if body.status == UserStatus.disabled:
                self._ensure_not_last_admin(target, disabling=True)
            target.status = body.status

        if body.full_name is not None:
            target.full_name = body.full_name

        self.db.commit()
        self.db.refresh(target)
        return target

    def delete_user(self, actor: User, user_id: UUID) -> None:
        target = self.get_user(actor, user_id)
        if actor.id == target.id:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Cannot delete your own account",
            )
        self._ensure_not_last_admin(target, deleting=True)
        self.db.delete(target)
        self.db.commit()

    def resend_invite(self, actor: User, user_id: UUID) -> User:
        target = self.get_user(actor, user_id)
        temp_password = generate_temp_password()
        target.password_hash = hash_password(temp_password)
        target.must_change_password = True
        target.status = UserStatus.invited
        self.db.commit()
        self.db.refresh(target)
        send_invite_safe(target.email, target.full_name, temp_password)
        return target

    def list_scope_assignments(self, actor: User, user_id: UUID) -> list[UserScopeAssignment]:
        target = self.get_user(actor, user_id)
        if target.organization_id is None:
            return []
        return (
            self.db.query(UserScopeAssignment)
            .filter(
                UserScopeAssignment.user_id == target.id,
                UserScopeAssignment.organization_id == target.organization_id,
            )
            .order_by(UserScopeAssignment.created_at)
            .all()
        )

    def add_scope_assignment(
        self, actor: User, user_id: UUID, body: UserScopeAssignmentCreate
    ) -> UserScopeAssignment:
        target = self.get_user(actor, user_id)
        if target.role != UserRole.data_steward:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Scope assignments apply only to Data Steward users",
            )
        if target.organization_id is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Organization context required")
        row = UserScopeAssignment(
            user_id=target.id,
            organization_id=target.organization_id,
            business_unit_id=body.business_unit_id,
            department_id=body.department_id,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return row

    def remove_scope_assignment(self, actor: User, user_id: UUID, scope_id: UUID) -> None:
        target = self.get_user(actor, user_id)
        row = self.db.get(UserScopeAssignment, scope_id)
        if row is None or row.user_id != target.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Scope assignment not found")
        self.db.delete(row)
        self.db.commit()
