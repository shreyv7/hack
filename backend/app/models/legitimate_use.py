"""Legitimate use and exemption registry (DPDPA §7, §17)."""

import enum

from sqlalchemy import Column, Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class LegitimateUseGround(str, enum.Enum):
    employment = "employment"
    medical_emergency = "medical_emergency"
    disaster_response = "disaster_response"
    legal_claim = "legal_claim"
    research_statistics = "research_statistics"
    fraud_default = "fraud_default"
    judicial_regulatory = "judicial_regulatory"
    startup_notification = "startup_notification"
    other = "other"


class LegitimateUseStatus(str, enum.Enum):
    active = "active"
    under_review = "under_review"
    retired = "retired"


class LegitimateUseRecord(Base, BaseModel):
    __tablename__ = "legitimate_use_records"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title = Column(String(512), nullable=False)
    ground_type = Column(
        Enum(LegitimateUseGround, name="legitimate_use_ground"),
        nullable=False,
    )
    legal_rationale = Column(Text, nullable=False, default="")
    approver_name = Column(String(255), nullable=True)
    approver_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    retention_basis = Column(Text, nullable=True)
    downstream_sharing = Column(Text, nullable=True)
    review_date = Column(Date, nullable=True)
    exemption_tags = Column(JSON, nullable=False, server_default="[]")
    evidence_refs = Column(JSON, nullable=False, server_default="[]")
    status = Column(
        Enum(LegitimateUseStatus, name="legitimate_use_status"),
        nullable=False,
        default=LegitimateUseStatus.active,
    )
    ropa_activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    last_reviewed_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    approver = relationship("User", foreign_keys=[approver_user_id])
