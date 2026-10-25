"""
Retention Policies — DPDPA Section 8(7): erase personal data once its purpose is
served.

Two tables:
  * RetentionPolicy — a rule: "keep <category> for <period> from <trigger>, then
    <action>". Optionally targets a registered data source + inventory asset +
    the date column used to compute expiry.
  * RetentionRun — an evaluation/execution record (the deletion audit trail). For
    safety the MVP runs as a DRY-RUN that COUNTS what would expire (no live
    delete); a human then confirms. See docs/MODULE_ROADMAP.md §3.4.
"""

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
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class RetentionPeriodUnit(str, enum.Enum):
    days = "days"
    months = "months"
    years = "years"


class TriggerEvent(str, enum.Enum):
    creation_date = "creation_date"
    last_interaction = "last_interaction"
    consent_withdrawal = "consent_withdrawal"
    contract_end = "contract_end"
    custom = "custom"


class RetentionAction(str, enum.Enum):
    delete = "delete"
    anonymize = "anonymize"
    mask = "mask"
    pseudonymize = "pseudonymize"
    archive = "archive"
    manual_review = "manual_review"


class PolicyStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    paused = "paused"


class RunStatus(str, enum.Enum):
    pending_confirmation = "pending_confirmation"  # dry-run done, awaiting human confirm
    completed = "completed"     # acknowledged (audit only — no rows deleted)
    executed = "executed"       # rows actually deleted from the source
    failed = "failed"


class RetentionPolicy(Base, BaseModel):
    __tablename__ = "retention_policies"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    data_category = Column(String(128), nullable=True)
    # Optional targets used by the dry-run to count expiring records.
    data_source_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_sources.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    asset_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_assets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # The date/timestamp column used to compute expiry (e.g. "created_at").
    trigger_field = Column(String(128), nullable=True)

    period_value = Column(Integer, nullable=False, server_default="1")
    period_unit = Column(
        Enum(RetentionPeriodUnit, name="retention_period_unit"),
        nullable=False,
        default=RetentionPeriodUnit.years,
    )
    trigger_event = Column(
        Enum(TriggerEvent, name="retention_trigger_event"),
        nullable=False,
        default=TriggerEvent.creation_date,
    )
    legal_basis = Column(String(128), nullable=True)
    action = Column(
        Enum(RetentionAction, name="retention_action"),
        nullable=False,
        default=RetentionAction.delete,
    )
    auto_delete = Column(Boolean, nullable=False, server_default="false")
    notify_before_days = Column(Integer, nullable=False, server_default="7")
    status = Column(
        Enum(PolicyStatus, name="retention_policy_status"),
        nullable=False,
        default=PolicyStatus.active,
    )
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    evidentiary_profile = Column(JSON, nullable=True)
    source_purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    organization = relationship("Organization", back_populates="retention_policies")
    runs = relationship(
        "RetentionRun",
        back_populates="policy",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RetentionRun(Base, BaseModel):
    __tablename__ = "retention_runs"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("retention_policies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_at = Column(DateTime(timezone=True), nullable=False)
    cutoff_date = Column(DateTime(timezone=True), nullable=True)
    records_matched = Column(Integer, nullable=False, server_default="0")
    records_deleted = Column(Integer, nullable=False, server_default="0")
    action = Column(Enum(RetentionAction, name="retention_action"), nullable=False)
    status = Column(
        Enum(RunStatus, name="retention_run_status"),
        nullable=False,
        default=RunStatus.pending_confirmation,
    )
    certificate_ref = Column(String(32), nullable=True)
    executed_by = Column(String(255), nullable=True)
    detail = Column(Text, nullable=True)

    policy = relationship("RetentionPolicy", back_populates="runs")
