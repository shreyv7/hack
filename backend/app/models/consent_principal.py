"""Cross-channel consent principal linkage for banking industry pack."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class LinkageSource(str, enum.Enum):
    bank_provided = "bank_provided"
    platform_derived = "platform_derived"


class ConsentPrincipal(Base, BaseModel):
    __tablename__ = "consent_principals"
    __table_args__ = (
        UniqueConstraint("organization_id", "canonical_ref", name="uq_consent_principal_org_ref"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    canonical_ref = Column(String(255), nullable=False)
    linkage_source = Column(
        Enum(LinkageSource, name="consent_linkage_source"),
        nullable=False,
        default=LinkageSource.platform_derived,
    )

    organization = relationship("Organization")
    identifiers = relationship(
        "ConsentPrincipalIdentifier",
        back_populates="principal",
        cascade="all, delete-orphan",
    )
    receipts = relationship("ConsentReceipt", back_populates="principal")


class ConsentPrincipalIdentifier(Base, BaseModel):
    __tablename__ = "consent_principal_identifiers"
    __table_args__ = (
        UniqueConstraint(
            "principal_id",
            "identifier_type",
            "identifier_token",
            name="uq_principal_identifier_token",
        ),
    )

    principal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    identifier_type = Column(String(64), nullable=False, index=True)
    identifier_token = Column(String(512), nullable=False)
    token_fingerprint = Column(String(64), nullable=False, index=True)
    last_seen_channel = Column(String(128), nullable=True)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    principal = relationship("ConsentPrincipal", back_populates="identifiers")
