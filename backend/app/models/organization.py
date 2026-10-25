import enum

from sqlalchemy import Column, Enum, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class OrganizationStatus(str, enum.Enum):
    pending = "pending"        # self-signed-up, awaiting superadmin approval
    active = "active"
    suspended = "suspended"


class Organization(Base, BaseModel):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False)
    slug = Column(String(128), nullable=False, unique=True, index=True)
    status = Column(
        Enum(OrganizationStatus, name="organization_status"),
        nullable=False,
        default=OrganizationStatus.active,
    )

    users = relationship(
        "User",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,  # rely on the DB's ON DELETE CASCADE, don't NULL the FK
    )
    settings = relationship(
        "OrganizationSettings",
        back_populates="organization",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    data_processors = relationship(
        "DataProcessor",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    purposes = relationship(
        "Purpose",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    consent_notices = relationship(
        "ConsentNotice",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    data_rights_requests = relationship(
        "DataRightsRequest",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    data_sources = relationship(
        "DataSource",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    data_inventory_assets = relationship(
        "DataInventoryAsset",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    child_data_records = relationship(
        "ChildDataRecord",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    retention_policies = relationship(
        "RetentionPolicy",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    masking_rules = relationship(
        "MaskingRule",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    policies = relationship(
        "PolicyDocument",
        back_populates="organization",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
