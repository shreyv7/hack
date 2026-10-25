from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from app.models.organization import OrganizationStatus


class OrganizationCreate(BaseModel):
    org_name: str = Field(min_length=1, max_length=255)
    slug: str = Field(min_length=1, max_length=128, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    admin_email: EmailStr
    admin_full_name: str = Field(min_length=1, max_length=255)


class OrganizationRead(BaseModel):
    id: UUID
    name: str
    slug: str
    status: OrganizationStatus
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: OrganizationStatus | None = None


class OrganizationWithAdminResponse(BaseModel):
    organization: OrganizationRead
    admin_user: "UserRead"
    invite_email_sent: bool = False


from app.schemas.user import UserRead  # noqa: E402

OrganizationWithAdminResponse.model_rebuild()
