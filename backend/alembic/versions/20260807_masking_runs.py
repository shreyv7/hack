"""Masking apply audit runs — DPDPA Sec 8(1) accountability."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260807_masking_runs"
down_revision: Union[str, None] = "20260806_pii_scan_schedule"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        sa.text(
            "DO $$ BEGIN "
            "CREATE TYPE masking_run_trigger AS ENUM ('manual', 'retention', 'withdrawal'); "
            "EXCEPTION WHEN duplicate_object THEN NULL; END $$"
        )
    )
    op.create_table(
        "masking_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("inventory_field_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("table_name", sa.String(255), nullable=False),
        sa.Column("column_name", sa.String(255), nullable=False),
        sa.Column("pii_category", sa.String(64), nullable=True),
        sa.Column(
            "strategy",
            postgresql.ENUM(
                "mask", "redact", "hash", "replace", "encrypt", "generalize",
                name="masking_strategy",
                create_type=False,
            ),
            nullable=False,
        ),
        sa.Column("rows_updated", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "trigger",
            postgresql.ENUM("manual", "retention", "withdrawal", name="masking_run_trigger", create_type=False),
            server_default="manual",
            nullable=False,
        ),
        sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("proof_vault_record_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["inventory_field_id"], ["data_inventory_fields.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["triggered_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["proof_vault_record_id"], ["proof_vault_records.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_masking_runs_organization_id", "masking_runs", ["organization_id"])
    op.create_index("ix_masking_runs_data_source_id", "masking_runs", ["data_source_id"])
    op.create_index("ix_masking_runs_created_at", "masking_runs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_masking_runs_created_at", "masking_runs")
    op.drop_index("ix_masking_runs_data_source_id", "masking_runs")
    op.drop_index("ix_masking_runs_organization_id", "masking_runs")
    op.drop_table("masking_runs")
    op.execute("DROP TYPE IF EXISTS masking_run_trigger")
