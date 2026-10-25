"""
Retention Obligations — application-level erasure duties (Stage 4).

Where a RetentionPolicy describes a rule at the storage/table level, an
*obligation* is a concrete, per-subject duty created by a lifecycle event
(consent withdrawal, account closure, DSAR erasure): "subject X's data is due
for erasure on <due_at>, unless held until <legal_hold_until>."

The org's own application drives enforcement over an API-key-authenticated API
(mirroring the Children's Data enforcement API): it reports events, polls which
obligations are due, purges at its own level (respecting its FK graph, caches,
search indexes and backups), then marks them fulfilled. This is the
"retention at the application level, not only the database" model.
"""

import enum

from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel
from app.models.retention import RetentionAction, TriggerEvent


class ObligationStatus(str, enum.Enum):
    pending = "pending"        # created; due date in the future
    due = "due"                # due now (past due_at and any legal hold)
    fulfilled = "fulfilled"    # the app confirmed erasure
    on_hold = "on_hold"        # blocked by a legal-retention hold
    cancelled = "cancelled"    # withdrawn (e.g. consent re-granted)


class RetentionObligation(Base, BaseModel):
    __tablename__ = "retention_obligations"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # The caller's own identifier for the data principal (e.g. user id).
    subject_ref = Column(String(255), nullable=False, index=True)
    data_category = Column(String(128), nullable=True)
    purpose = Column(String(128), nullable=True)
    # The policy that produced this obligation (if matched); SET NULL on delete.
    policy_id = Column(
        UUID(as_uuid=True),
        ForeignKey("retention_policies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    trigger_event = Column(
        Enum(TriggerEvent, name="retention_trigger_event", create_type=False),
        nullable=False,
        default=TriggerEvent.consent_withdrawal,
    )
    action = Column(
        Enum(RetentionAction, name="retention_action", create_type=False),
        nullable=False,
        default=RetentionAction.delete,
    )
    event_at = Column(DateTime(timezone=True), nullable=False)
    due_at = Column(DateTime(timezone=True), nullable=False, index=True)
    # Earliest moment erasure is permitted (DPDP ≥1yr log hold, etc.). Null = none.
    legal_hold_until = Column(DateTime(timezone=True), nullable=True)
    status = Column(
        Enum(ObligationStatus, name="retention_obligation_status"),
        nullable=False,
        default=ObligationStatus.pending,
        index=True,
    )
    # How the obligation was created: api | consent | dsar | manual.
    source = Column(String(32), nullable=False, default="api")

    fulfilled_at = Column(DateTime(timezone=True), nullable=True)
    fulfilled_by = Column(String(255), nullable=True)
    # Evidence the app returns when it purges (systems cleared, backups, etc.).
    evidence = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)

    organization = relationship("Organization")
