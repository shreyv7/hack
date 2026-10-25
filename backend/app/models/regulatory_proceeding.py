"""Regulatory proceedings workspace (DPDPA §27–§37)."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class RegulatoryProceedingType(str, enum.Enum):
    board_notice = "board_notice"
    inquiry = "inquiry"
    voluntary_undertaking = "voluntary_undertaking"
    appeal = "appeal"
    penalty = "penalty"
    correspondence = "correspondence"


class RegulatoryProceedingStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    submitted = "submitted"
    closed = "closed"
    appealed = "appealed"


class RegulatoryProceeding(Base, BaseModel):
    __tablename__ = "regulatory_proceedings"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    proceeding_ref = Column(String(64), nullable=False, index=True)
    proceeding_type = Column(
        Enum(RegulatoryProceedingType, name="regulatory_proceeding_type"),
        nullable=False,
    )
    status = Column(
        Enum(RegulatoryProceedingStatus, name="regulatory_proceeding_status"),
        nullable=False,
        default=RegulatoryProceedingStatus.open,
    )
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)
    board_reference = Column(String(255), nullable=True)
    penalty_exposure_crores = Column(Integer, nullable=True)
    due_at = Column(DateTime(timezone=True), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)
    assigned_to_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    evidence_pack = Column(JSON, nullable=False, server_default="[]")
    correspondence_log = Column(JSON, nullable=False, server_default="[]")
    linked_breach_id = Column(
        UUID(as_uuid=True),
        ForeignKey("breach_incidents.id", ondelete="SET NULL"),
        nullable=True,
    )
    linked_audit_refs = Column(JSON, nullable=False, server_default="[]")

    organization = relationship("Organization")
    assignee = relationship("User", foreign_keys=[assigned_to_user_id])
