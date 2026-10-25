from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.rbac import INVITABLE_ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, role_permission_summary
from app.models.user import UserRole, UserStatus


class UserRead(BaseModel):
    id: UUID
    organization_id: UUID | None
    email: EmailStr
    full_name: str
    role: UserRole
    status: UserStatus
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserInvite(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    role: UserRole = UserRole.user

    @field_validator("role")
    @classmethod
    def role_not_superadmin(cls, value: UserRole) -> UserRole:
        if value == UserRole.superadmin:
            raise ValueError("Cannot invite superadmin role")
        return value


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: UserRole | None = None
    status: UserStatus | None = None


class RoleRead(BaseModel):
    value: UserRole
    label: str
    description: str
    permissions: list[str]
    invitable: bool


class UserScopeAssignmentRead(BaseModel):
    id: UUID
    user_id: UUID
    organization_id: UUID
    business_unit_id: UUID | None
    department_id: UUID | None

    model_config = {"from_attributes": True}


class UserScopeAssignmentCreate(BaseModel):
    business_unit_id: UUID | None = None
    department_id: UUID | None = None


def build_role_catalog() -> list[RoleRead]:
    return [
        RoleRead(
            value=role,
            label=ROLE_LABELS.get(role, role.value),
            description=ROLE_DESCRIPTIONS.get(role, ""),
            permissions=role_permission_summary(role),
            invitable=role in INVITABLE_ROLES,
        )
        for role in UserRole
    ]
