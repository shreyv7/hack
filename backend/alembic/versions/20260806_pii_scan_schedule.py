"""PII Scanner recurring schedules — DPDPA Sec 10 continuous monitoring."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260806_pii_scan_schedule"
down_revision: Union[str, None] = "20260805_overlay_comments"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pii_scan_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "frequency",
            sa.Enum("daily", "weekly", "monthly", name="pii_scan_frequency"),
            server_default="weekly",
            nullable=False,
        ),
        sa.Column("sample_size", sa.Integer(), server_default="100", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pii_scan_schedules_organization_id", "pii_scan_schedules", ["organization_id"])
    op.create_index("ix_pii_scan_schedules_data_source_id", "pii_scan_schedules", ["data_source_id"])


def downgrade() -> None:
    op.drop_index("ix_pii_scan_schedules_data_source_id", "pii_scan_schedules")
    op.drop_index("ix_pii_scan_schedules_organization_id", "pii_scan_schedules")
    op.drop_table("pii_scan_schedules")
    op.execute("DROP TYPE IF EXISTS pii_scan_frequency")
