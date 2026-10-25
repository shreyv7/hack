"""retention policies and deletion runs (DPDPA Section 8(7))

Revision ID: 20260611_retention
Revises: 20260608_children
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260611_retention"
down_revision: Union[str, None] = "20260608_children"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

period_unit = postgresql.ENUM("days", "months", "years", name="retention_period_unit", create_type=False)
trigger_event = postgresql.ENUM(
    "creation_date", "last_interaction", "consent_withdrawal", "contract_end", "custom",
    name="retention_trigger_event", create_type=False,
)
action = postgresql.ENUM(
    "delete", "anonymize", "archive", "manual_review", name="retention_action", create_type=False,
)
policy_status = postgresql.ENUM("draft", "active", "paused", name="retention_policy_status", create_type=False)
run_status = postgresql.ENUM(
    "pending_confirmation", "completed", "failed", name="retention_run_status", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum("days", "months", "years", name="retention_period_unit").create(bind, checkfirst=True)
    sa.Enum(
        "creation_date", "last_interaction", "consent_withdrawal", "contract_end", "custom",
        name="retention_trigger_event",
    ).create(bind, checkfirst=True)
    sa.Enum(
        "delete", "anonymize", "archive", "manual_review", name="retention_action",
    ).create(bind, checkfirst=True)
    sa.Enum("draft", "active", "paused", name="retention_policy_status").create(bind, checkfirst=True)
    sa.Enum(
        "pending_confirmation", "completed", "failed", name="retention_run_status",
    ).create(bind, checkfirst=True)

    op.create_table(
        "retention_policies",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("data_category", sa.String(length=128), nullable=True),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_field", sa.String(length=128), nullable=True),
        sa.Column("period_value", sa.Integer(), server_default="1", nullable=False),
        sa.Column("period_unit", period_unit, server_default="years", nullable=False),
        sa.Column("trigger_event", trigger_event, server_default="creation_date", nullable=False),
        sa.Column("legal_basis", sa.String(length=128), nullable=True),
        sa.Column("action", action, server_default="delete", nullable=False),
        sa.Column("auto_delete", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notify_before_days", sa.Integer(), server_default="7", nullable=False),
        sa.Column("status", policy_status, server_default="active", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retention_policies_organization_id", "retention_policies", ["organization_id"])
    op.create_index("ix_retention_policies_data_source_id", "retention_policies", ["data_source_id"])
    op.create_index("ix_retention_policies_asset_id", "retention_policies", ["asset_id"])

    op.create_table(
        "retention_runs",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("policy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cutoff_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("records_matched", sa.Integer(), server_default="0", nullable=False),
        sa.Column("records_deleted", sa.Integer(), server_default="0", nullable=False),
        sa.Column("action", action, nullable=False),
        sa.Column("status", run_status, server_default="pending_confirmation", nullable=False),
        sa.Column("certificate_ref", sa.String(length=32), nullable=True),
        sa.Column("executed_by", sa.String(length=255), nullable=True),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["policy_id"], ["retention_policies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_retention_runs_organization_id", "retention_runs", ["organization_id"])
    op.create_index("ix_retention_runs_policy_id", "retention_runs", ["policy_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_retention_runs_policy_id", table_name="retention_runs")
    op.drop_index("ix_retention_runs_organization_id", table_name="retention_runs")
    op.drop_table("retention_runs")
    op.drop_index("ix_retention_policies_asset_id", table_name="retention_policies")
    op.drop_index("ix_retention_policies_data_source_id", table_name="retention_policies")
    op.drop_index("ix_retention_policies_organization_id", table_name="retention_policies")
    op.drop_table("retention_policies")
    sa.Enum(name="retention_run_status").drop(bind, checkfirst=True)
    sa.Enum(name="retention_policy_status").drop(bind, checkfirst=True)
    sa.Enum(name="retention_action").drop(bind, checkfirst=True)
    sa.Enum(name="retention_trigger_event").drop(bind, checkfirst=True)
    sa.Enum(name="retention_period_unit").drop(bind, checkfirst=True)
