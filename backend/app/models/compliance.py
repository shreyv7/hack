import enum

from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class SectionCoverageStatus(str, enum.Enum):
    covered = "covered"
    partial = "partial"
    na = "na"


class SecurityControlStatus(str, enum.Enum):
    documented = "documented"
    partial = "partial"
    missing = "missing"


class BreachIncidentStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    closed = "closed"


class BreachNotificationChannel(str, enum.Enum):
    dpb_email = "dpb_email"
    dp_email = "dp_email"
    public = "public"


class AuditEventType(str, enum.Enum):
    configuration = "Configuration"
    deletion = "Deletion"
    consent = "Consent"
    access = "Access"
    rights = "Rights"
    breach = "Breach"


class AuditSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class DpdpaStatuteSection(Base, BaseModel):
    """Global DPDPA statute section catalog for the compliance map."""

    __tablename__ = "dpdpa_statute_sections"
    __table_args__ = (UniqueConstraint("section_key", name="uq_dpdpa_statute_sections_key"),)

    section_key = Column(String(16), nullable=False, index=True)
    chapter = Column(Integer, nullable=False)
    chapter_title = Column(String(255), nullable=False)
    section_number = Column(String(32), nullable=False)
    title = Column(String(512), nullable=False)
    statute_reference = Column(String(128), nullable=False, default="DPDPA 2023")
    statute_excerpt = Column(Text, nullable=True)
    penalty_crores = Column(Integer, nullable=True)
    feature_count = Column(Integer, nullable=False, default=0)
    coverage_status = Column(
        Enum(SectionCoverageStatus, name="section_coverage_status"),
        nullable=False,
        default=SectionCoverageStatus.covered,
    )
    sort_order = Column(Integer, nullable=False, default=0)

    features = relationship(
        "DpdpaFeatureMapping",
        back_populates="section",
        cascade="all, delete-orphan",
        order_by="DpdpaFeatureMapping.sort_order",
    )


class DpdpaFeatureMapping(Base, BaseModel):
    __tablename__ = "dpdpa_feature_mappings"

    section_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpdpa_statute_sections.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    section_key = Column(String(16), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    route = Column(String(128), nullable=False, default="")
    implementation_status = Column(String(32), nullable=False, default="implemented")
    sort_order = Column(Integer, nullable=False, default=0)

    section = relationship("DpdpaStatuteSection", back_populates="features")


class SecurityControl(Base, BaseModel):
    __tablename__ = "security_controls"
    __table_args__ = (
        UniqueConstraint("organization_id", "control_key", name="uq_security_controls_org_key"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    control_key = Column(String(64), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(
        Enum(SecurityControlStatus, name="security_control_status"),
        nullable=False,
        default=SecurityControlStatus.missing,
    )
    checklist_items = Column(JSON, nullable=False, server_default="[]")
    items_total = Column(Integer, nullable=False, default=0)
    items_completed = Column(Integer, nullable=False, default=0)
    evidence_label = Column(String(512), nullable=True)
    updated_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class SecurityCertification(Base, BaseModel):
    __tablename__ = "security_certifications"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    status = Column(String(64), nullable=False, default="active")
    issued_at = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    auditor_firm = Column(String(255), nullable=True)


class BreachIncident(Base, BaseModel):
    __tablename__ = "breach_incidents"
    __table_args__ = (UniqueConstraint("incident_ref", name="uq_breach_incidents_ref"),)

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
    incident_ref = Column(String(32), nullable=False, index=True)
    status = Column(
        Enum(BreachIncidentStatus, name="breach_incident_status"),
        nullable=False,
        default=BreachIncidentStatus.draft,
    )
    discovered_at = Column(DateTime(timezone=True), nullable=False)
    deadline_at = Column(DateTime(timezone=True), nullable=False)
    current_step = Column(Integer, nullable=False, default=1)
    severity = Column(String(32), nullable=False, default="medium")
    wizard_data = Column(JSON, nullable=False, server_default="{}")
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_to_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    escalated_to_user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    escalated_at = Column(DateTime(timezone=True), nullable=True)

    notifications = relationship(
        "BreachNotification",
        back_populates="incident",
        cascade="all, delete-orphan",
    )


class BreachNotification(Base, BaseModel):
    __tablename__ = "breach_notifications"

    incident_id = Column(
        UUID(as_uuid=True),
        ForeignKey("breach_incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(
        Enum(BreachNotificationChannel, name="breach_notification_channel"),
        nullable=False,
    )
    recipient = Column(String(320), nullable=False)
    subject = Column(String(512), nullable=True)
    body_snapshot = Column(Text, nullable=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    email_sent = Column(Boolean, nullable=False, default=False)

    incident = relationship("BreachIncident", back_populates="notifications")


class AuditLogEntry(Base, BaseModel):
    __tablename__ = "audit_log_entries"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(320), nullable=False, default="system")
    actor_role = Column(String(64), nullable=False, default="system")
    action = Column(String(512), nullable=False)
    details = Column(Text, nullable=False, default="")
    event_type = Column(
        Enum(
            AuditEventType,
            name="audit_event_type",
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        default=AuditEventType.configuration,
    )
    severity = Column(
        Enum(AuditSeverity, name="audit_severity"),
        nullable=False,
        default=AuditSeverity.info,
    )
    resource_type = Column(String(128), nullable=True)
    resource_id = Column(String(128), nullable=True)
    prev_hash = Column(String(64), nullable=False, default="0" * 64)
    entry_hash = Column(String(64), nullable=False, index=True)


class AuditLogVerification(Base, BaseModel):
    __tablename__ = "audit_log_verifications"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    verified_at = Column(DateTime(timezone=True), nullable=False)
    verified_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    merkle_root = Column(String(64), nullable=False)
    entry_count = Column(Integer, nullable=False, default=0)
    integrity_ok = Column(Boolean, nullable=False, default=True)
