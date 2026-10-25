"""Per-user scope assignments for Data Steward role."""

from sqlalchemy import Column, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base
from app.models.base import BaseModel


class UserScopeAssignment(Base, BaseModel):
    __tablename__ = "user_scope_assignments"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "organization_id",
            "business_unit_id",
            "department_id",
            name="uq_user_scope_assignment",
        ),
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    department_id = Column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
