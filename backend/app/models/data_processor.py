import enum
from datetime import date

from sqlalchemy import Column, Date, Enum, ForeignKey, String, Text, Integer, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DpaStatus(str, enum.Enum):
    signed = "signed"
    expired = "expired"
    none = "none"
    under_review = "under_review"


class DataProcessor(Base, BaseModel):
    """Third-party data processor registered by an organization (Q11)."""

    __tablename__ = "data_processors"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    name = Column(String(255), nullable=False)
    processor_role = Column(String(128), nullable=False, default="Data Processor")
    purpose = Column(Text, nullable=True)
    dpa_status = Column(
        Enum(DpaStatus, name="dpa_status"),
        nullable=False,
        default=DpaStatus.none,
    )
    dpa_signed_date = Column(Date, nullable=True)
    risk_level = Column(String(32), nullable=True)
    data_categories = Column(Text, nullable=True)
    location = Column(String(255), nullable=True)
    contact_email = Column(String(320), nullable=True)

    # TPRM Extensions
    category = Column(String(128), nullable=False, default="Other")
    security_score = Column(Integer, nullable=False, default=80)
    monitoring = Column(String(64), nullable=False, default="Continuous")
    logo = Column(String(64), nullable=True)
    last_audit_date = Column(Date, nullable=True)
    certifications = Column(JSONB, nullable=True, server_default="'[]'")
    encryption = Column(String(128), nullable=True)
    tier = Column(String(32), nullable=False, default="Tier 3")
    assessment_status = Column(String(32), nullable=False, default="not_started")
    assessment_completed_at = Column(Date, nullable=True)
    last_monitored_at = Column(DateTime(timezone=True), nullable=True)
    monitoring_status = Column(String(32), nullable=False, default="healthy")
    monitoring_details = Column(JSONB, nullable=True, server_default="'{}'")

    # CBT Extensions
    is_offshore = Column(Boolean, nullable=False, default=False)
    country_code = Column(String(3), nullable=True)

    organization = relationship("Organization", back_populates="data_processors")

