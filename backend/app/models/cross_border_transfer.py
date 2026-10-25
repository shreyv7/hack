import enum
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Boolean,
    Date,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class TransferStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    suspended = "suspended"
    terminated = "terminated"


class ContractStatus(str, enum.Enum):
    draft = "draft"
    under_review = "under_review"
    approved = "approved"
    signed = "signed"
    expired = "expired"


class CbtTransfer(Base, BaseModel):
    __tablename__ = "cbt_transfers"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_processor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_processors.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    destination_country = Column(String(128), nullable=False)  # Name of country
    country_code = Column(String(3), nullable=False)  # ISO code, e.g. USA, IND, SGP
    destination_entity = Column(String(255), nullable=False)
    transfer_purpose = Column(Text, nullable=True)
    legal_basis = Column(String(128), nullable=False, default="contract")  # contract, consent, legal_obligation
    adequacy_status = Column(String(64), nullable=False, default="unknown")  # adequate, standard_contractual_clauses, etc
    safeguard_mechanism = Column(Text, nullable=True)
    status = Column(
        Enum(TransferStatus, name="cbt_transfer_status"),
        nullable=False,
        default=TransferStatus.draft,
    )
    
    # SDF specific fields
    is_sdf_transfer = Column(Boolean, nullable=False, default=False)
    dpia_required = Column(Boolean, nullable=False, default=False)
    dpia_completed_at = Column(DateTime(timezone=True), nullable=True)
    next_review_date = Column(Date, nullable=True)

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
    data_processor = relationship("DataProcessor")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    contracts = relationship("CbtContract", back_populates="transfer", cascade="all, delete-orphan")
    sdf_assessments = relationship("CbtSdfAssessment", back_populates="transfer", cascade="all, delete-orphan")
    dpia = relationship("Dpia")


class CbtContract(Base, BaseModel):
    __tablename__ = "cbt_contracts"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cbt_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(255), nullable=False)
    status = Column(
        Enum(ContractStatus, name="cbt_contract_status"),
        nullable=False,
        default=ContractStatus.draft,
    )
    current_live_version_id = Column(UUID(as_uuid=True), nullable=True)

    organization = relationship("Organization")
    transfer = relationship("CbtTransfer", back_populates="contracts")
    versions = relationship(
        "CbtContractVersion",
        back_populates="contract",
        foreign_keys="[CbtContractVersion.contract_id]",
        cascade="all, delete-orphan",
    )


class CbtContractVersion(Base, BaseModel):
    __tablename__ = "cbt_contract_versions"
    __table_args__ = (
        UniqueConstraint("contract_id", "version_number", name="uq_cbt_contract_version_number"),
    )

    contract_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cbt_contracts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(
        Enum(ContractStatus, name="cbt_contract_version_status"),
        nullable=False,
        default=ContractStatus.draft,
    )
    content = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    published_at = Column(DateTime(timezone=True), nullable=True)
    published_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    contract = relationship("CbtContract", back_populates="versions", foreign_keys=[contract_id])
    published_by = relationship("User", foreign_keys=[published_by_user_id])


class CbtSdfAssessment(Base, BaseModel):
    __tablename__ = "cbt_sdf_assessments"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cbt_transfers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assessment_date = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    assessor_name = Column(String(255), nullable=False)
    risk_level = Column(String(32), nullable=False, default="medium")  # low, medium, high, critical
    findings = Column(Text, nullable=True)
    mitigation_measures = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="pending")  # pending, completed, under_review

    organization = relationship("Organization")
    transfer = relationship("CbtTransfer", back_populates="sdf_assessments")


class CbtActivity(Base, BaseModel):
    __tablename__ = "cbt_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transfer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("cbt_transfers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False)
    transfer_name = Column(String(255), nullable=False)
    user_name = Column(String(255), nullable=False)
    details = Column(JSONB, nullable=True)

    organization = relationship("Organization")
    transfer = relationship("CbtTransfer")
