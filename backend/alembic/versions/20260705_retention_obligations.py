"""add retention_obligations table (application-level erasure duties)

Revision ID: 20260705_ret_obligations
Revises: 20260704_field_mand_ret
Create Date: 2026-07-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260705_ret_obligations"
down_revision: Union[str, None] = "20260704_field_mand_ret"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # create_type=False so create_table doesn't try to re-emit CREATE TYPE; we
    # create it once, explicitly, below.
    obligation_status = postgresql.ENUM(
        "pending", "due", "fulfilled", "on_hold", "cancelled",
        name="retention_obligation_status",
        create_type=False,
    )
    obligation_status.create(op.get_bind(), checkfirst=True)

    # These enum types already exist (created with the retention tables); reuse
    # them without re-creating.
    trigger_event = postgresql.ENUM(name="retention_trigger_event", create_type=False)
    action = postgresql.ENUM(name="retention_action", create_type=False)

    op.create_table(
        "retention_obligations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("subject_ref", sa.String(length=255), nullable=False),
        sa.Column("data_category", sa.String(length=128), nullable=True),
        sa.Column("purpose", sa.String(length=128), nullable=True),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_event", trigger_event, nullable=False),
        sa.Column("action", action, nullable=False),
        sa.Column("event_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("legal_hold_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", obligation_status, nullable=False, server_default="pending"),
        sa.Column("source", sa.String(length=32), nullable=False, server_default="api"),
        sa.Column("fulfilled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fulfilled_by", sa.String(length=255), nullable=True),
        sa.Column("evidence", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["policy_id"], ["retention_policies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retention_obligations_organization_id", "retention_obligations", ["organization_id"])
    op.create_index("ix_retention_obligations_subject_ref", "retention_obligations", ["subject_ref"])
    op.create_index("ix_retention_obligations_due_at", "retention_obligations", ["due_at"])
    op.create_index("ix_retention_obligations_status", "retention_obligations", ["status"])
    op.create_index("ix_retention_obligations_policy_id", "retention_obligations", ["policy_id"])


def downgrade() -> None:
    op.drop_index("ix_retention_obligations_policy_id", table_name="retention_obligations")
    op.drop_index("ix_retention_obligations_status", table_name="retention_obligations")
    op.drop_index("ix_retention_obligations_due_at", table_name="retention_obligations")
    op.drop_index("ix_retention_obligations_subject_ref", table_name="retention_obligations")
    op.drop_index("ix_retention_obligations_organization_id", table_name="retention_obligations")
    op.drop_table("retention_obligations")
    postgresql.ENUM(name="retention_obligation_status").drop(op.get_bind(), checkfirst=True)
