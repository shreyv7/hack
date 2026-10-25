import enum
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Float,
    UniqueConstraint,
    Date,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


# Enums for CISO Command Center
class CisoControlStatus(str, enum.Enum):
    healthy = "healthy"
    warning = "warning"
    critical = "critical"
    not_configured = "not_configured"
    in_progress = "in_progress"
    exception = "exception"


class CisoPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class CisoRiskStatus(str, enum.Enum):
    open = "open"
    treated = "treated"
    accepted = "accepted"


class CisoRemediationStatus(str, enum.Enum):
    open = "open"
    assigned = "assigned"
    in_progress = "in_progress"
    blocked = "blocked"
    completed = "completed"
    overdue = "overdue"


class CisoExceptionType(str, enum.Enum):
    temporary = "temporary"
    permanent = "permanent"


class CisoFramework(Base, BaseModel):
    """Compliance Framework definition (e.g., DPDPA, ISO27001, CIS, NIST)."""
    __tablename__ = "ciso_frameworks"
    __table_args__ = (UniqueConstraint("code", name="uq_ciso_frameworks_code"),)

    name = Column(String(255), nullable=False)
    code = Column(String(64), nullable=False, index=True)
    description = Column(Text, nullable=True)

    requirements = relationship("CisoRequirement", back_populates="framework", cascade="all, delete-orphan")


class CisoRequirement(Base, BaseModel):
    """Specific requirements/clauses within a framework."""
    __tablename__ = "ciso_requirements"
    __table_args__ = (UniqueConstraint("framework_id", "req_key", name="uq_ciso_requirements_key"),)

    framework_id = Column(UUID(as_uuid=True), ForeignKey("ciso_frameworks.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(255), nullable=False)  # e.g., Access Control, Data Protection
    req_key = Column(String(64), nullable=False, index=True)  # e.g., A.9.1.1 or Sec 8(1)
    title = Column(String(512), nullable=False)
    description = Column(Text, nullable=True)

    framework = relationship("CisoFramework", back_populates="requirements")
    controls = relationship(
        "CisoControl",
        secondary="ciso_control_requirement_mappings",
        back_populates="requirements"
    )


class CisoControl(Base, BaseModel):
    """Internal security/compliance controls mapped to frameworks, evidence, and risks."""
    __tablename__ = "ciso_controls"
    __table_args__ = (UniqueConstraint("organization_id", "control_key", name="uq_ciso_controls_key"),)

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    control_key = Column(String(64), nullable=False, index=True)  # e.g., CTRL-001
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    tech_explanation = Column(Text, nullable=True)
    business_explanation = Column(Text, nullable=True)
    why_required = Column(Text, nullable=True)
    penalty_if_absent = Column(Text, nullable=True)

    status = Column(Enum(CisoControlStatus, name="ciso_control_status"), nullable=False, default=CisoControlStatus.not_configured)
    priority = Column(Enum(CisoPriority, name="ciso_priority"), nullable=False, default=CisoPriority.medium)
    category = Column(String(128), nullable=True)  # e.g., Administrative, Technical, Physical
    maturity = Column(String(64), nullable=True)  # e.g., Initial, Repeatable, Defined, Managed
    tags = Column(JSONB, nullable=False, server_default="[]")

    owner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Linked assets and other entities stored as arrays/json to avoid over-complicating
    assets_covered = Column(JSONB, nullable=False, server_default="[]")
    linked_policies = Column(JSONB, nullable=False, server_default="[]")
    linked_vendors = Column(JSONB, nullable=False, server_default="[]")
    linked_dpias = Column(JSONB, nullable=False, server_default="[]")
    linked_ropas = Column(JSONB, nullable=False, server_default="[]")
    linked_audit_logs = Column(JSONB, nullable=False, server_default="[]")
    version_id = Column(Integer, nullable=False, default=1)
    is_archived = Column(Boolean, nullable=False, default=False)

    organization = relationship("Organization")
    owner = relationship("User", foreign_keys=[owner_user_id])

    requirements = relationship(
        "CisoRequirement",
        secondary="ciso_control_requirement_mappings",
        back_populates="controls"
    )
    evidence = relationship(
        "CisoEvidence",
        secondary="ciso_control_evidence_mappings",
        back_populates="controls"
    )
    risks = relationship(
        "CisoRisk",
        secondary="ciso_control_risk_mappings",
        back_populates="controls"
    )
    remediation_tasks = relationship(
        "CisoRemediationTask",
        secondary="ciso_control_task_mappings",
        back_populates="controls"
    )
    exceptions = relationship("CisoException", back_populates="control", cascade="all, delete-orphan")
    comments = relationship("CisoControlComment", back_populates="control", cascade="all, delete-orphan")
    reviews = relationship("CisoControlReview", back_populates="control", cascade="all, delete-orphan")
    versions = relationship("CisoControlVersion", back_populates="control", cascade="all, delete-orphan")

    dpias = relationship(
        "Dpia",
        secondary="ciso_control_dpia_mappings",
        backref="ciso_controls"
    )
    ropas = relationship(
        "ProcessingActivity",
        secondary="ciso_control_ropa_mappings",
        backref="ciso_controls"
    )
    vendors = relationship(
        "DataProcessor",
        secondary="ciso_control_vendor_mappings",
        backref="ciso_controls"
    )
    incidents = relationship(
        "BreachIncident",
        secondary="ciso_control_incident_mappings",
        backref="ciso_controls"
    )
    proofs = relationship(
        "ProofVaultRecord",
        secondary="ciso_control_proof_mappings",
        backref="ciso_controls"
    )
    audits = relationship(
        "AuditLogEntry",
        secondary="ciso_control_audit_mappings",
        backref="ciso_controls"
    )
    policies = relationship(
        "PolicyDocument",
        secondary="ciso_control_policy_mappings",
        backref="ciso_controls"
    )
    assets = relationship(
        "SecurityAsset",
        secondary="ciso_control_asset_mappings",
        back_populates="controls"
    )


class CisoControlRequirementMapping(Base):
    """M:N mapping between CISO controls and framework requirements."""
    __tablename__ = "ciso_control_requirement_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    requirement_id = Column(UUID(as_uuid=True), ForeignKey("ciso_requirements.id", ondelete="CASCADE"), primary_key=True)


class CisoEvidence(Base, BaseModel):
    """Central repository of verified compliance evidence."""
    __tablename__ = "ciso_evidence"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(128), nullable=True)
    file_hash = Column(String(64), nullable=False)
    version = Column(Integer, nullable=False, default=1)

    uploader_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_verified = Column(Boolean, nullable=False, default=False)
    verified_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    uploader = relationship("User", foreign_keys=[uploader_user_id])
    verified_by = relationship("User", foreign_keys=[verified_by_user_id])

    controls = relationship(
        "CisoControl",
        secondary="ciso_control_evidence_mappings",
        back_populates="evidence"
    )


class CisoControlEvidenceMapping(Base):
    """M:N mapping between controls and uploaded evidence."""
    __tablename__ = "ciso_control_evidence_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    evidence_id = Column(UUID(as_uuid=True), ForeignKey("ciso_evidence.id", ondelete="CASCADE"), primary_key=True)


class CisoRisk(Base, BaseModel):
    """Security risk register for calculating impact, likelihood, and residual scores."""
    __tablename__ = "ciso_risks"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    risk_id = Column(String(32), nullable=False, index=True)  # e.g., RSK-001
    title = Column(String(255), nullable=False)
    category = Column(String(128), nullable=True)
    likelihood = Column(Integer, nullable=False, default=3)  # 1-5
    impact = Column(Integer, nullable=False, default=3)  # 1-5
    score = Column(Integer, nullable=False, default=9)  # likelihood * impact

    owner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(CisoRiskStatus, name="ciso_risk_status"), nullable=False, default=CisoRiskStatus.open)
    treatment = Column(Text, nullable=True)
    residual_score = Column(Integer, nullable=True)

    organization = relationship("Organization")
    owner = relationship("User", foreign_keys=[owner_user_id])

    controls = relationship(
        "CisoControl",
        secondary="ciso_control_risk_mappings",
        back_populates="risks"
    )


class CisoControlRiskMapping(Base):
    """M:N mapping between controls and risks."""
    __tablename__ = "ciso_control_risk_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    risk_id = Column(UUID(as_uuid=True), ForeignKey("ciso_risks.id", ondelete="CASCADE"), primary_key=True)


class CisoRemediationTask(Base, BaseModel):
    """Tasks created to resolve security gaps and failing controls."""
    __tablename__ = "ciso_remediation_tasks"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    task_ref = Column(String(32), nullable=False, index=True)  # e.g., REM-001
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    owner_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(CisoRemediationStatus, name="ciso_remediation_status"), nullable=False, default=CisoRemediationStatus.open)
    priority = Column(Enum(CisoPriority, name="ciso_priority"), nullable=False, default=CisoPriority.medium)
    progress = Column(Integer, nullable=False, default=0)  # 0-100
    due_date = Column(Date, nullable=True)

    organization = relationship("Organization")
    owner = relationship("User", foreign_keys=[owner_user_id])

    controls = relationship(
        "CisoControl",
        secondary="ciso_control_task_mappings",
        back_populates="remediation_tasks"
    )


class CisoControlTaskMapping(Base):
    """M:N mapping between controls and remediation tasks."""
    __tablename__ = "ciso_control_task_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("ciso_remediation_tasks.id", ondelete="CASCADE"), primary_key=True)


class CisoException(Base, BaseModel):
    """Active control exception tracking."""
    __tablename__ = "ciso_exceptions"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), nullable=False, index=True)
    exception_type = Column(Enum(CisoExceptionType, name="ciso_exception_type"), nullable=False, default=CisoExceptionType.temporary)
    approved_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    reason = Column(Text, nullable=False)
    compensating_controls = Column(Text, nullable=True)

    organization = relationship("Organization")
    control = relationship("CisoControl", back_populates="exceptions")
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])


class CisoBoardReport(Base, BaseModel):
    """Metadata for historical board reports generated and exported."""
    __tablename__ = "ciso_board_reports"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    file_url = Column(String(512), nullable=True)
    score_snapshot = Column(JSONB, nullable=False, server_default="{}")
    created_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    organization = relationship("Organization")
    created_by = relationship("User", foreign_keys=[created_by_user_id])


class CisoScoreSnapshot(Base, BaseModel):
    """Snapshots of scores over time to plot analytics trends."""
    __tablename__ = "ciso_score_snapshots"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    overall_score = Column(Float, nullable=False, default=0.0)
    controls_score = Column(Float, nullable=False, default=0.0)
    evidence_score = Column(Float, nullable=False, default=0.0)
    risks_score = Column(Float, nullable=False, default=0.0)
    policies_score = Column(Float, nullable=False, default=0.0)
    vendors_score = Column(Float, nullable=False, default=0.0)
    incidents_score = Column(Float, nullable=False, default=0.0)
    recorded_date = Column(Date, nullable=False, server_default=func.current_date())

    organization = relationship("Organization")


class CisoControlComment(Base, BaseModel):
    """Activity/comments feed on a security control."""
    __tablename__ = "ciso_control_comments"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), nullable=False, index=True)
    comment = Column(Text, nullable=False)
    author_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    organization = relationship("Organization")
    control = relationship("CisoControl", back_populates="comments")
    author = relationship("User", foreign_keys=[author_user_id])


class CisoControlReview(Base, BaseModel):
    """Formal compliance review logs for a control."""
    __tablename__ = "ciso_control_reviews"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    outcome = Column(String(64), nullable=False)  # e.g., Approved, Rejected
    notes = Column(Text, nullable=True)

    organization = relationship("Organization")
    control = relationship("CisoControl", back_populates="reviews")
    reviewer = relationship("User", foreign_keys=[reviewer_user_id])


class CisoScoreSettings(Base, BaseModel):
    """Scoring weights and parameters configured per tenant/organization."""
    __tablename__ = "ciso_score_settings"
    __table_args__ = (UniqueConstraint("organization_id", name="uq_ciso_score_settings_org"),)

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    controls_weight = Column(Float, nullable=False, default=0.30)
    evidence_weight = Column(Float, nullable=False, default=0.20)
    risks_weight = Column(Float, nullable=False, default=0.15)
    policies_weight = Column(Float, nullable=False, default=0.15)
    vendors_weight = Column(Float, nullable=False, default=0.10)
    incidents_weight = Column(Float, nullable=False, default=0.10)
    thresholds = Column(JSONB, nullable=False, server_default='{"healthy": 80, "warning": 50}')

    organization = relationship("Organization")


class CisoControlVersion(Base, BaseModel):
    """Archived/historical versions of security controls."""
    __tablename__ = "ciso_control_versions"

    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(64), nullable=False)
    priority = Column(String(64), nullable=False)
    assets_covered = Column(JSONB, nullable=False, server_default="[]")
    linked_policies = Column(JSONB, nullable=False, server_default="[]")
    linked_vendors = Column(JSONB, nullable=False, server_default="[]")
    linked_ropas = Column(JSONB, nullable=False, server_default="[]")
    linked_dpias = Column(JSONB, nullable=False, server_default="[]")
    modified_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    change_summary = Column(Text, nullable=True)
    archived_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    organization = relationship("Organization")
    control = relationship("CisoControl", back_populates="versions")
    modified_by = relationship("User", foreign_keys=[modified_by_user_id])


class CisoActivity(Base, BaseModel):
    """Ledger of GRC activity logs for controls, exceptions, evidence, and risks."""
    __tablename__ = "ciso_activities"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    entity_type = Column(String(64), nullable=False)  # 'control', 'evidence', 'risk', 'exception', 'remediation'
    entity_id = Column(UUID(as_uuid=True), nullable=False)
    activity_type = Column(String(128), nullable=False)  # e.g., 'status_changed', 'exception_approved'
    payload = Column(JSONB, nullable=False, server_default="{}")
    description = Column(Text, nullable=False)

    organization = relationship("Organization")
    actor = relationship("User", foreign_keys=[actor_user_id])


class CisoControlDpiaMapping(Base):
    """M:N mapping between CisoControl and Dpia."""
    __tablename__ = "ciso_control_dpia_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    dpia_id = Column(UUID(as_uuid=True), ForeignKey("dpias.id", ondelete="CASCADE"), primary_key=True)


class CisoControlRopaMapping(Base):
    """M:N mapping between CisoControl and ProcessingActivity."""
    __tablename__ = "ciso_control_ropa_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    ropa_id = Column(UUID(as_uuid=True), ForeignKey("processing_activities.id", ondelete="CASCADE"), primary_key=True)


class CisoControlVendorMapping(Base):
    """M:N mapping between CisoControl and DataProcessor (Vendor)."""
    __tablename__ = "ciso_control_vendor_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    vendor_id = Column(UUID(as_uuid=True), ForeignKey("data_processors.id", ondelete="CASCADE"), primary_key=True)


class CisoControlIncidentMapping(Base):
    """M:N mapping between CisoControl and BreachIncident."""
    __tablename__ = "ciso_control_incident_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    incident_id = Column(UUID(as_uuid=True), ForeignKey("breach_incidents.id", ondelete="CASCADE"), primary_key=True)


class CisoControlProofMapping(Base):
    """M:N mapping between CisoControl and ProofVaultRecord."""
    __tablename__ = "ciso_control_proof_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    proof_id = Column(UUID(as_uuid=True), ForeignKey("proof_vault_records.id", ondelete="CASCADE"), primary_key=True)


class CisoControlAuditMapping(Base):
    """M:N mapping between CisoControl and AuditLogEntry."""
    __tablename__ = "ciso_control_audit_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    audit_id = Column(UUID(as_uuid=True), ForeignKey("audit_log_entries.id", ondelete="CASCADE"), primary_key=True)


class CisoOrganizationControl(Base, BaseModel):
    """Internal security/compliance controls defined by organizations, mapped back to the 19 CIS controls."""
    __tablename__ = "ciso_organization_controls"
    __table_args__ = (UniqueConstraint("organization_id", "control_key", name="uq_ciso_org_controls_key"),)

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    control_key = Column(String(64), nullable=False, index=True)  # e.g., ORG-CTRL-001
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(CisoControlStatus, name="ciso_org_control_status"), nullable=False, default=CisoControlStatus.not_configured)
    priority = Column(Enum(CisoPriority, name="ciso_org_priority"), nullable=False, default=CisoPriority.medium)

    mapped_ciso_control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="SET NULL"), nullable=True, index=True)

    # Framework mappings for the internal control
    cis_mappings = Column(JSONB, nullable=False, server_default="[]")
    iso_mappings = Column(JSONB, nullable=False, server_default="[]")
    dpdpa_mappings = Column(JSONB, nullable=False, server_default="[]")
    nist_mappings = Column(JSONB, nullable=False, server_default="[]")

    organization = relationship("Organization")
    mapped_ciso_control = relationship("CisoControl", backref="organization_controls")


class CisoControlPolicyMapping(Base):
    __tablename__ = "ciso_control_policy_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    policy_id = Column(UUID(as_uuid=True), ForeignKey("policy_documents.id", ondelete="CASCADE"), primary_key=True)


class SecurityAsset(Base, BaseModel):
    __tablename__ = "security_assets"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    asset_type = Column(String(128), nullable=False)  # 'database', 'server', 'application', 'identity_provider'
    environment = Column(String(64), nullable=False, default="production")
    provider = Column(String(64), nullable=False)  # 'aws', 'gcp', 'on_premises'
    external_ref_id = Column(String(255), nullable=True)
    security_status = Column(String(64), nullable=False, default="secure")  # 'secure', 'vulnerable', 'compromised'
    last_scanned_at = Column(DateTime(timezone=True), nullable=True)

    organization = relationship("Organization")
    controls = relationship(
        "CisoControl",
        secondary="ciso_control_asset_mappings",
        back_populates="assets"
    )


class CisoControlAssetMapping(Base):
    __tablename__ = "ciso_control_asset_mappings"
    control_id = Column(UUID(as_uuid=True), ForeignKey("ciso_controls.id", ondelete="CASCADE"), primary_key=True)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("security_assets.id", ondelete="CASCADE"), primary_key=True)


class VulnerabilityScanLog(Base, BaseModel):
    __tablename__ = "vulnerability_scan_logs"

    organization_id = Column(UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    asset_id = Column(UUID(as_uuid=True), ForeignKey("security_assets.id", ondelete="CASCADE"), nullable=False, index=True)
    scanner_name = Column(String(128), nullable=False)  # 'AWS Inspector', 'Dependabot', etc.
    findings = Column(JSONB, nullable=False, server_default="[]")  # list of CVEs, severity, desc
    status = Column(String(64), nullable=False, default="clean")  # 'clean', 'findings_found', 'failed'
    scanned_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    organization = relationship("Organization")
    asset = relationship("SecurityAsset")

