"""Consent enforcement — decision log, purpose mappings, and withdrawal remediation."""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class EnforcementMode(str, enum.Enum):
    disabled = "disabled"
    shadow = "shadow"
    enforced = "enforced"


class DenyBehavior(str, enum.Enum):
    reject = "reject"
    strip_fields = "strip_fields"
    queue_pending = "queue_pending"


class EnforcementDecision(str, enum.Enum):
    allowed = "allowed"
    denied = "denied"
    shadow_would_deny = "shadow_would_deny"


class WithdrawalAction(str, enum.Enum):
    suppress = "suppress"
    mask = "mask"
    anonymize = "anonymize"
    delete = "delete"
    pseudonymize = "pseudonymize"
    flag_manual_review = "flag_manual_review"


class RemediationTaskStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    cancelled = "cancelled"


class PurposeEnforcementConfig(Base, BaseModel):
    __tablename__ = "purpose_enforcement_configs"
    __table_args__ = (
        UniqueConstraint("organization_id", "purpose_id", name="uq_purpose_enforcement_org_purpose"),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    mode = Column(
        Enum(EnforcementMode, name="enforcement_mode"),
        nullable=False,
        default=EnforcementMode.disabled,
        server_default="disabled",
    )
    deny_behavior = Column(
        Enum(DenyBehavior, name="enforcement_deny_behavior"),
        nullable=False,
        default=DenyBehavior.reject,
        server_default="reject",
    )
    updated_by_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class PurposeDataMapping(Base, BaseModel):
    __tablename__ = "purpose_data_mappings"
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "purpose_id",
            "inventory_field_id",
            name="uq_purpose_data_mapping_org_purpose_field",
        ),
    )

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_field_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_fields.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    withdrawal_action = Column(
        Enum(WithdrawalAction, name="withdrawal_action"),
        nullable=False,
        default=WithdrawalAction.suppress,
        server_default="suppress",
    )

    inventory_field = relationship("DataInventoryField", backref="purpose_mappings")
    purpose = relationship("Purpose")


class WithdrawalRemediationTask(Base, BaseModel):
    """Manual remediation queue for fields not connected to an automated data source."""

    __tablename__ = "withdrawal_remediation_tasks"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    purpose_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purposes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    inventory_field_id = Column(
        UUID(as_uuid=True),
        ForeignKey("data_inventory_fields.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    principal_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_principals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id = Column(UUID(as_uuid=True), ForeignKey("integration_properties.id", ondelete="SET NULL"), nullable=True)
    receipt_id = Column(UUID(as_uuid=True), ForeignKey("consent_receipts.id", ondelete="SET NULL"), nullable=True)
    mapping_id = Column(
        UUID(as_uuid=True),
        ForeignKey("purpose_data_mappings.id", ondelete="SET NULL"),
        nullable=True,
    )
    action = Column(
        Enum(WithdrawalAction, name="withdrawal_action", create_type=False),
        nullable=False,
    )
    status = Column(
        Enum(RemediationTaskStatus, name="remediation_task_status"),
        nullable=False,
        default=RemediationTaskStatus.pending,
        server_default="pending",
        index=True,
    )
    sla_due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    proof_vault_record_id = Column(UUID(as_uuid=True), ForeignKey("proof_vault_records.id", ondelete="SET NULL"), nullable=True)


class EnforcementEvent(Base):
    """Append-only enforcement decision log (partitioned by occurred_at in DB)."""

    __tablename__ = "enforcement_events"

    id = Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    organization_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    property_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    purpose_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    principal_fingerprint = Column(String(64), nullable=False, index=True)
    decision = Column(String(32), nullable=False)
    legal_basis = Column(String(32), nullable=False)
    effective_mode = Column(String(16), nullable=False)
    receipt_id = Column(UUID(as_uuid=True), nullable=True)
    collection_point = Column(String(255), nullable=True)
    latency_ms = Column(Integer, nullable=True)
    occurred_at = Column(DateTime(timezone=True), primary_key=True, nullable=False, server_default=func.now())
