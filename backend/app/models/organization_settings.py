import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DeploymentModel(str, enum.Enum):
    public = "public"
    private = "private"
    hybrid = "hybrid"
    on_prem = "on_prem"


class DpdpRole(str, enum.Enum):
    data_fiduciary = "data_fiduciary"
    data_processor = "data_processor"
    significant_data_fiduciary = "significant_data_fiduciary"


class OrganizationSettings(Base, BaseModel):
    """Per-organization workspace & compliance settings (1:1 with Organization)."""

    __tablename__ = "organization_settings"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Workspace profile (Q1–Q4, Q7)
    registered_address = Column(Text, nullable=True)
    headquarters = Column(String(512), nullable=True)
    india_presence = Column(Text, nullable=True)
    solution_description = Column(Text, nullable=True)
    logo_url = Column(String(2048), nullable=True)
    dpo_name = Column(String(255), nullable=True)
    dpo_email = Column(String(320), nullable=True)
    dpo_phone = Column(String(64), nullable=True)
    compliance_version = Column(String(128), nullable=True)
    changelog_summary = Column(Text, nullable=True)
    self_attested_at = Column(DateTime(timezone=True), nullable=True)
    third_party_audit_firm = Column(String(255), nullable=True)
    audit_valid_until = Column(DateTime(timezone=True), nullable=True)

    # Industry (Q8, S.10)
    primary_industry = Column(String(128), nullable=True)
    secondary_industries = Column(JSON, nullable=False, server_default="[]")
    is_significant_data_fiduciary = Column(Boolean, nullable=False, default=False)
    data_principals_count_band = Column(String(64), nullable=True)
    annual_turnover_band = Column(String(64), nullable=True)

    # Deployment (Q5–Q6, S.16)
    deployment_model = Column(
        Enum(DeploymentModel, name="deployment_model"),
        nullable=False,
        default=DeploymentModel.public,
    )
    primary_region = Column(String(128), nullable=True)
    backup_region = Column(String(128), nullable=True)
    allowed_regions = Column(JSON, nullable=False, server_default="[]")
    data_residency = Column(JSON, nullable=False, server_default="[]")

    # DPDP role (Q9–Q10)
    dpdp_role = Column(
        Enum(DpdpRole, name="dpdp_role"),
        nullable=False,
        default=DpdpRole.data_fiduciary,
    )
    role_assessed_at = Column(DateTime(timezone=True), nullable=True)
    role_assessment = Column(JSON, nullable=True)

    # Per-org DSAR SLA overrides (DPDPA S.11–14); null uses statutory defaults
    dsar_sla_config = Column(JSON, nullable=True)

    # Per right-type portal request form schemas (admin/user customizable)
    dsar_portal_forms = Column(JSON, nullable=True)

    # Optional email field on consent banner → send data-rights portal link
    consent_portal_email_config = Column(JSON, nullable=True)

    # Banking industry pack: identifier types, journeys, property mapping
    consent_industry_config = Column(JSON, nullable=True)

    # DPDPA minimum evidentiary retention defaults (Req 6)
    retention_evidentiary_config = Column(JSON, nullable=True)

    # Default consent notice language (Req 3) — ISO-ish code e.g. hi, en
    default_consent_language = Column(String(16), nullable=True)

    # DPDPA compliance map review metadata
    dpdpa_map_last_reviewed_at = Column(DateTime(timezone=True), nullable=True)
    dpdpa_map_reviewed_by = Column(String(255), nullable=True)

    organization = relationship("Organization", back_populates="settings")
