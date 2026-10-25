import enum
from sqlalchemy import (
    Column, String, Integer, Boolean, ForeignKey, DateTime, Text, Numeric, Date, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class DpiaStatus(str, enum.Enum):
    draft = "draft"
    under_review = "under_review"
    approved = "approved"
    rejected = "rejected"
    periodic_review = "periodic_review"
    archived = "archived"


class DpiaVersionStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    approved = "approved"
    superseded = "superseded"


class DpiaStepStatus(str, enum.Enum):
    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class DpiaRiskStatus(str, enum.Enum):
    identified = "identified"
    mitigated = "mitigated"
    accepted = "accepted"


class DpiaControlStatus(str, enum.Enum):
    planned = "planned"
    implementing = "implementing"
    active = "active"
    failed = "failed"


class DpiaApprovalStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    bypassed = "bypassed"


class DpiaReviewCycleStatus(str, enum.Enum):
    scheduled = "scheduled"
    active = "active"
    completed = "completed"
    overdue = "overdue"


class DpiaTaskStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    completed = "completed"
    overdue = "overdue"


class Dpia(Base, BaseModel):
    __tablename__ = "dpias"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    business_unit_id = Column(
        UUID(as_uuid=True),
        ForeignKey("business_units.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    dpia_ref = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    current_version_id = Column(UUID(as_uuid=True), nullable=True)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaStatus.draft.value
    )

    # Relationships
    organization = relationship("Organization")
    versions = relationship(
        "DpiaVersion",
        back_populates="dpia",
        foreign_keys="[DpiaVersion.dpia_id]",
        cascade="all, delete-orphan"
    )
    steps = relationship(
        "DpiaStep",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )
    review_cycles = relationship(
        "DpiaReviewCycle",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )
    dataflows = relationship(
        "DpiaDataflow",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )
    assets = relationship(
        "DpiaAsset",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )
    comments = relationship(
        "DpiaComment",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )
    events = relationship(
        "DpiaEvent",
        back_populates="dpia",
        cascade="all, delete-orphan"
    )


class DpiaVersion(Base, BaseModel):
    __tablename__ = "dpia_versions"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    version_number = Column(Integer, nullable=False)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaVersionStatus.draft.value
    )
    changelog = Column(Text, nullable=True)
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    approved_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    dpia = relationship("Dpia", back_populates="versions", foreign_keys=[dpia_id])
    created_by = relationship("User")
    step_answers = relationship(
        "DpiaStepAnswer",
        back_populates="version",
        cascade="all, delete-orphan"
    )
    risks = relationship(
        "DpiaRisk",
        back_populates="version",
        cascade="all, delete-orphan"
    )
    approvals = relationship(
        "DpiaApproval",
        back_populates="version",
        cascade="all, delete-orphan"
    )
    reports = relationship(
        "DpiaReport",
        back_populates="version",
        cascade="all, delete-orphan"
    )


class DpiaStep(Base, BaseModel):
    __tablename__ = "dpia_steps"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    step_key = Column(String(64), nullable=False, index=True)
    step_order = Column(Integer, nullable=False)
    completion_percentage = Column(Integer, nullable=False, default=0)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaStepStatus.not_started.value
    )

    # Relationships
    dpia = relationship("Dpia", back_populates="steps")


class DpiaStepAnswer(Base, BaseModel):
    __tablename__ = "dpia_step_answers"

    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    step_key = Column(String(64), nullable=False, index=True)
    question_key = Column(String(64), nullable=False, index=True)
    answer_text = Column(Text, nullable=True)
    answer_json = Column(JSONB, nullable=True)
    compliance_status = Column(String(32), nullable=False, default="unverified")

    # Relationships
    version = relationship("DpiaVersion", back_populates="step_answers")
    evidence = relationship(
        "DpiaEvidence",
        back_populates="step_answer"
    )
    compliance_checks = relationship(
        "DpiaComplianceCheck",
        back_populates="answer",
        cascade="all, delete-orphan"
    )


class DpiaRisk(Base, BaseModel):
    __tablename__ = "dpia_risks"

    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String(64), nullable=True)
    likelihood = Column(Integer, nullable=False)
    impact = Column(Integer, nullable=False)
    sensitivity_factor = Column(Numeric(3, 2), nullable=False, default=1.00)
    inherent_score = Column(Numeric(5, 2), nullable=False)
    residual_likelihood = Column(Integer, nullable=True)
    residual_impact = Column(Integer, nullable=True)
    residual_score = Column(Numeric(5, 2), nullable=True)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaRiskStatus.identified.value
    )
    is_auto_escalated = Column(Boolean, nullable=False, default=False)

    # Relationships
    version = relationship("DpiaVersion", back_populates="risks")
    controls = relationship(
        "DpiaControl",
        back_populates="risk",
        cascade="all, delete-orphan"
    )
    tasks = relationship(
        "DpiaTask",
        back_populates="risk",
        cascade="all, delete-orphan"
    )


class DpiaControlLibrary(Base, BaseModel):
    __tablename__ = "dpia_control_library"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    control_code = Column(String(64), unique=True, index=True, nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    control_type = Column(String(32), nullable=False)
    mitigation_weight = Column(Numeric(3, 2), nullable=False)
    standards_mapping = Column(JSONB, nullable=True)

    # Relationships
    organization = relationship("Organization")


class DpiaControl(Base, BaseModel):
    __tablename__ = "dpia_controls"

    risk_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_risks.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    control_library_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_control_library.id", ondelete="RESTRICT"),
        nullable=False
    )
    status = Column(
        String(32),
        nullable=False,
        default=DpiaControlStatus.planned.value
    )
    owner_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    custom_instructions = Column(Text, nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )

    # Relationships
    risk = relationship("DpiaRisk", back_populates="controls")
    library_control = relationship("DpiaControlLibrary")
    owner = relationship("User", foreign_keys=[owner_user_id])
    verifier = relationship("User", foreign_keys=[verified_by])
    evidence = relationship(
        "DpiaEvidence",
        back_populates="control"
    )
    compliance_checks = relationship(
        "DpiaComplianceCheck",
        back_populates="control",
        cascade="all, delete-orphan"
    )


class DpiaApproval(Base, BaseModel):
    __tablename__ = "dpia_approvals"

    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    workflow_node_id = Column(UUID(as_uuid=True), nullable=True)
    approver_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    role_required = Column(String(64), nullable=False)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaApprovalStatus.pending.value
    )
    comments = Column(Text, nullable=True)
    decided_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    version = relationship("DpiaVersion", back_populates="approvals")
    approver = relationship("User")


class DpiaReviewCycle(Base, BaseModel):
    __tablename__ = "dpia_review_cycles"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    scheduled_date = Column(Date, nullable=False)
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaReviewCycleStatus.scheduled.value
    )
    notes = Column(Text, nullable=True)

    # Relationships
    dpia = relationship("Dpia", back_populates="review_cycles")


class DpiaTask(Base, BaseModel):
    __tablename__ = "dpia_tasks"

    risk_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_risks.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    control_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_controls.id", ondelete="SET NULL"),
        nullable=True
    )
    title = Column(String(255), nullable=False)
    assignee_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    due_date = Column(Date, nullable=True)
    status = Column(
        String(32),
        nullable=False,
        default=DpiaTaskStatus.open.value
    )

    # Relationships
    risk = relationship("DpiaRisk", back_populates="tasks")
    control = relationship("DpiaControl")
    assignee = relationship("User")


class DpiaEvidence(Base, BaseModel):
    __tablename__ = "dpia_evidence"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=False)
    file_size = Column(Integer, nullable=True)
    uploaded_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    uploaded_at = Column(DateTime(timezone=True), server_default="now()")
    linked_control_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_controls.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    linked_answer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_step_answers.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )

    # Relationships
    organization = relationship("Organization")
    uploaded_by_user = relationship("User")
    control = relationship("DpiaControl", back_populates="evidence")
    step_answer = relationship("DpiaStepAnswer", back_populates="evidence")


class DpiaComment(Base, BaseModel):
    __tablename__ = "dpia_comments"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    parent_comment_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_comments.id", ondelete="CASCADE"),
        nullable=True
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    step_key = Column(String(64), nullable=True)
    content = Column(Text, nullable=False)

    # Relationships
    dpia = relationship("Dpia", back_populates="comments")
    user = relationship("User")
    parent = relationship(
        "DpiaComment",
        remote_side="DpiaComment.id",
        back_populates="replies"
    )
    replies = relationship(
        "DpiaComment",
        back_populates="parent",
        cascade="all, delete-orphan"
    )


class DpiaEvent(Base, BaseModel):
    __tablename__ = "dpia_events"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    event_type = Column(String(64), nullable=False)
    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    details = Column(JSONB, nullable=True)
    previous_state = Column(JSONB, nullable=True)
    new_state = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    chain_hash = Column(String(64), nullable=False)

    # Relationships
    dpia = relationship("Dpia", back_populates="events")
    actor = relationship("User")


class DpiaReport(Base, BaseModel):
    __tablename__ = "dpia_reports"

    version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    report_type = Column(String(64), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_hash = Column(String(64), nullable=False)
    generated_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    generated_at = Column(DateTime(timezone=True), server_default="now()")

    # Relationships
    version = relationship("DpiaVersion", back_populates="reports")
    generator = relationship("User")


class DpiaTemplate(Base, BaseModel):
    __tablename__ = "dpia_templates"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    key = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    schema_definition = Column(JSONB, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

    # Relationships
    organization = relationship("Organization")


class DpiaDataflow(Base, BaseModel):
    __tablename__ = "dpia_dataflows"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    flow_data = Column(JSONB, nullable=False)

    # Relationships
    dpia = relationship("Dpia", back_populates="dataflows")


class DpiaAsset(Base, BaseModel):
    __tablename__ = "dpia_assets"

    dpia_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpias.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    asset_type = Column(String(64), nullable=False)  # database, api, s3_bucket, vendor, application
    asset_id = Column(UUID(as_uuid=True), nullable=False, index=True)

    # Relationships
    dpia = relationship("Dpia", back_populates="assets")


class DpiaComplianceCheck(Base, BaseModel):
    __tablename__ = "dpia_compliance_checks"

    answer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_step_answers.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    control_id = Column(
        UUID(as_uuid=True),
        ForeignKey("dpia_controls.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    obligation_code = Column(String(64), nullable=False, index=True)
    is_satisfied = Column(Boolean, nullable=False, default=False)

    # Relationships
    answer = relationship("DpiaStepAnswer", back_populates="compliance_checks")
    control = relationship("DpiaControl", back_populates="compliance_checks")
