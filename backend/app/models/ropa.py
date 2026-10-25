import uuid
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class BusinessUnit(Base, BaseModel):
    __tablename__ = "business_units"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_business_units_org_name"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(128), nullable=False)
    code = Column(String(32), nullable=True)
    head_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
    head_user = relationship("User", foreign_keys=[head_user_id])
    departments = relationship(
        "Department",
        back_populates="business_unit",
        cascade="all, delete-orphan",
    )


class Department(Base, BaseModel):
    __tablename__ = "departments"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_departments_org_name"),
    )

    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(128), nullable=False)
    code = Column(String(32), nullable=True)
    head_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    business_unit = relationship("BusinessUnit", back_populates="departments")
    organization = relationship("Organization")
    head_user = relationship("User", foreign_keys=[head_user_id])
    teams = relationship(
        "Team",
        back_populates="department",
        cascade="all, delete-orphan",
    )


class Team(Base, BaseModel):
    __tablename__ = "teams"
    __table_args__ = (
        UniqueConstraint("organization_id", "name", name="uq_teams_org_name"),
    )

    department_id = Column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(128), nullable=False)
    code = Column(String(32), nullable=True)
    head_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    department = relationship("Department", back_populates="teams")
    organization = relationship("Organization")
    head_user = relationship("User", foreign_keys=[head_user_id])


class ProcessingActivity(Base, BaseModel):
    __tablename__ = "processing_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_ref = Column(String(64), nullable=False, unique=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(32), nullable=False, default="draft")
    risk_score = Column(Integer, nullable=False, default=0)
    risk_level = Column(String(16), nullable=False, default="low")

    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    department_id = Column(
        UUID(as_uuid=True),
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    team_id = Column(
        UUID(as_uuid=True),
        ForeignKey("teams.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    current_version_id = Column(UUID(as_uuid=True), nullable=True)
    banking_context = Column(JSONB, nullable=True)
    is_deleted = Column(Boolean, nullable=False, default=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    organization = relationship("Organization")
    business_unit = relationship("BusinessUnit")
    department = relationship("Department")
    team = relationship("Team")

    versions = relationship(
        "ActivityVersion",
        back_populates="activity",
        foreign_keys="[ActivityVersion.activity_id]",
        cascade="all, delete-orphan",
    )
    owners = relationship(
        "ActivityOwner",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    purposes = relationship(
        "ActivityPurpose",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    data_categories = relationship(
        "ActivityDataCategory",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    data_principals = relationship(
        "ActivityDataPrincipal",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    lawful_bases = relationship(
        "ActivityLawfulBasis",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    systems = relationship(
        "ActivitySystem",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    recipients = relationship(
        "ActivityRecipient",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    cross_border_transfers = relationship(
        "ActivityCrossBorderTransfer",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    retention_policies = relationship(
        "ActivityRetentionPolicy",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    security_measures = relationship(
        "ActivitySecurityMeasure",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    dpia_links = relationship(
        "ActivityDpiaLink",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    data_sources = relationship(
        "ActivityDataSource",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    approvals = relationship(
        "ActivityApproval",
        back_populates="activity",
        cascade="all, delete-orphan",
    )
    events = relationship(
        "ActivityEvent",
        back_populates="activity",
        cascade="all, delete-orphan",
    )


class ActivityVersion(Base, BaseModel):
    __tablename__ = "activity_versions"
    __table_args__ = (
        UniqueConstraint("activity_id", "version_number", name="uq_activity_versions_number"),
    )

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_number = Column(Integer, nullable=False)
    status = Column(String(32), nullable=False, default="draft")
    snapshot_json = Column(JSONB, nullable=False)
    changelog = Column(Text, nullable=True)
    created_by_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at = Column(DateTime(timezone=True), nullable=True)

    activity = relationship("ProcessingActivity", back_populates="versions", foreign_keys=[activity_id])
    created_by = relationship("User")


class ActivityOwner(Base, BaseModel):
    __tablename__ = "activity_owners"
    __table_args__ = (
        UniqueConstraint("activity_id", "user_id", "owner_role", name="uq_activity_owners_role"),
    )

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    owner_role = Column(String(32), nullable=False)

    activity = relationship("ProcessingActivity", back_populates="owners")
    user = relationship("User")


class ActivityPurpose(Base, BaseModel):
    __tablename__ = "activity_purposes"
    __table_args__ = (
        UniqueConstraint("activity_id", "purpose_id", name="uq_activity_purposes_unique"),
    )

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="RESTRICT"),
        nullable=False,
    )
    sort_order = Column(Integer, nullable=False, default=0)

    activity = relationship("ProcessingActivity", back_populates="purposes")
    purpose = relationship("Purpose")


class ActivityDataCategory(Base, BaseModel):
    __tablename__ = "activity_data_categories"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_name = Column(String(128), nullable=False)
    is_special = Column(Boolean, nullable=False, default=False)
    sensitivity = Column(String(16), default="standard")

    activity = relationship("ProcessingActivity", back_populates="data_categories")


class ActivityDataPrincipal(Base, BaseModel):
    __tablename__ = "activity_data_principals"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    includes_children = Column(Boolean, nullable=False, default=False)

    activity = relationship("ProcessingActivity", back_populates="data_principals")


class ActivityLawfulBasis(Base, BaseModel):
    __tablename__ = "activity_lawful_bases"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    basis_type = Column(String(32), nullable=False)
    justification = Column(Text, nullable=True)
    dpdpa_section = Column(String(32), nullable=True)
    lia_documented = Column(Boolean, nullable=False, default=False)
    lia_summary = Column(Text, nullable=True)
    lia_last_reviewed_at = Column(DateTime(timezone=True), nullable=True)

    activity = relationship("ProcessingActivity", back_populates="lawful_bases")


class ActivitySystem(Base, BaseModel):
    __tablename__ = "activity_systems"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    system_name = Column(String(255), nullable=False)
    system_type = Column(String(32), nullable=False)
    location = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel = Column(String(64), nullable=True)

    activity = relationship("ProcessingActivity", back_populates="systems")
    property = relationship("IntegrationProperty")


class ActivityRecipient(Base, BaseModel):
    __tablename__ = "activity_recipients"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_type = Column(String(32), nullable=False)
    name = Column(String(255), nullable=False)
    data_shared = Column(Text, nullable=True)
    data_processor_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_processors.id", ondelete="SET NULL"),
        nullable=True,
    )

    activity = relationship("ProcessingActivity", back_populates="recipients")
    data_processor = relationship("DataProcessor")


class ActivityCrossBorderTransfer(Base, BaseModel):
    __tablename__ = "activity_cross_border_transfers"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    destination_country = Column(String(128), nullable=False)
    destination_entity = Column(String(255), nullable=True)
    adequacy_status = Column(String(32), default="unknown")
    safeguard_mechanism = Column(String(64), nullable=True)
    legal_basis = Column(Text, nullable=True)

    activity = relationship("ProcessingActivity", back_populates="cross_border_transfers")


class ActivityRetentionPolicy(Base, BaseModel):
    __tablename__ = "activity_retention_policies"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    retention_period = Column(String(128), nullable=False)
    trigger_event = Column(String(128), nullable=True)
    legal_basis = Column(String(128), nullable=True)
    auto_delete = Column(Boolean, nullable=False, default=False)
    retention_policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("retention_policies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    activity = relationship("ProcessingActivity", back_populates="retention_policies")
    retention_policy = relationship("RetentionPolicy")


class ActivityDataSource(Base, BaseModel):
    __tablename__ = "activity_data_sources"
    __table_args__ = (
        UniqueConstraint("activity_id", "data_source_id", name="uq_activity_data_sources_unique"),
    )

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = Column(String(16), nullable=False, default="primary")
    notes = Column(Text, nullable=True)

    activity = relationship("ProcessingActivity", back_populates="data_sources")
    data_source = relationship("DataSource")


class ActivitySecurityMeasure(Base, BaseModel):
    __tablename__ = "activity_security_measures"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    measure_type = Column(String(64), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(16), default="active")

    activity = relationship("ProcessingActivity", back_populates="security_measures")


class ActivityDpiaLink(Base, BaseModel):
    __tablename__ = "activity_dpia_links"
    __table_args__ = (
        UniqueConstraint("activity_id", "dpia_id", name="uq_activity_dpia_links_unique"),
    )

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
    )
    link_type = Column(String(16), default="primary")

    activity = relationship("ProcessingActivity", back_populates="dpia_links")
    dpia = relationship("Dpia")


class ActivityApproval(Base, BaseModel):
    __tablename__ = "activity_approvals"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("activity_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    role_required = Column(String(64), nullable=False)
    approver_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String(16), nullable=False, default="pending")
    comments = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    activity = relationship("ProcessingActivity", back_populates="approvals")
    version = relationship("ActivityVersion")
    approver = relationship("User")


class ActivityEvent(Base, BaseModel):
    __tablename__ = "activity_events"

    activity_id = Column(
        UUID(as_uuid=True),
        ForeignKey("processing_activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String(64), nullable=False)
    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    details = Column(JSONB, nullable=True)
    previous_state = Column(JSONB, nullable=True)
    new_state = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    chain_hash = Column(String(64), nullable=False)

    activity = relationship("ProcessingActivity", back_populates="events")
    actor_user = relationship("User")


class RopaDiscoverySuggestion(Base, BaseModel):
    __tablename__ = "ropa_discovery_suggestions"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_type = Column(String(32), nullable=False)  # api | database | openapi | sdk | queue | job | etl | webhook | warehouse
    source_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    suggested_title = Column(String(255), nullable=False)
    suggested_description = Column(Text, nullable=True)
    suggested_data_categories = Column(JSONB, nullable=False, default=list)
    suggested_lawful_basis = Column(String(32), nullable=True)
    suggested_recipient = Column(String(255), nullable=True)
    status = Column(String(16), nullable=False, default="pending")  # pending | accepted | dismissed

    organization = relationship("Organization")

