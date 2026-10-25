import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    admin = "admin"
    user = "user"
    ciso = "ciso"
    legal_head = "legal_head"
    legal_counsel = "legal_counsel"
    compliance_officer = "compliance_officer"
    grievance_officer = "grievance_officer"
    security_analyst = "security_analyst"
    data_steward = "data_steward"
    auditor = "auditor"
    # DPDPA Section 9/10 statutory role — named regulatory identity for the DPO
    dpo = "dpo"
    # IT/Infrastructure Admin — technical workspace management, separate from compliance
    it_admin = "it_admin"
    branch_operator = "branch_operator"


class UserStatus(str, enum.Enum):
    invited = "invited"                    # created by an admin, has a temp password
    pending_approval = "pending_approval"  # self-signed-up, awaiting superadmin approval
    active = "active"
    disabled = "disabled"


class User(Base, BaseModel):
    __tablename__ = "users"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    email = Column(String(320), nullable=False, unique=True, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole, name="user_role"), nullable=False)
    status = Column(
        Enum(UserStatus, name="user_status"),
        nullable=False,
        default=UserStatus.invited,
    )
    must_change_password = Column(Boolean, nullable=False, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization", back_populates="users")
