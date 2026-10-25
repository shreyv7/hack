"""Anonymisation Phase 3: DP, scheduling, risk monitor, output destination.

Revision ID: 20260623_anon3
Revises: 20260623_anon2
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = "20260623_anon3"
down_revision = "20260623_anon2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    schedule = sa.Enum("one_time", "daily", "weekly", "monthly", name="anonymisation_schedule")
    schedule.create(op.get_bind(), checkfirst=True)

    op.add_column("anonymisation_jobs", sa.Column("epsilon", sa.Float(), nullable=True))
    op.add_column(
        "anonymisation_jobs",
        sa.Column("schedule", schedule, server_default="one_time", nullable=False),
    )
    op.add_column("anonymisation_jobs", sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("anonymisation_jobs", sa.Column("run_count", sa.Integer(), server_default="0", nullable=False))
    op.add_column("anonymisation_jobs", sa.Column("last_monitored_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("anonymisation_jobs", sa.Column("monitor_k", sa.Integer(), nullable=True))
    op.add_column("anonymisation_jobs", sa.Column("monitor_risk_percent", sa.Float(), nullable=True))
    op.add_column("anonymisation_jobs", sa.Column("monitor_status", sa.String(16), nullable=True))
    op.add_column(
        "anonymisation_jobs",
        sa.Column("output_destination", sa.String(32), server_default="download", nullable=False),
    )
    op.add_column(
        "anonymisation_jobs",
        sa.Column(
            "output_source_id", UUID(as_uuid=True),
            sa.ForeignKey("data_sources.id", ondelete="SET NULL"), nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("anonymisation_jobs", "output_source_id")
    op.drop_column("anonymisation_jobs", "output_destination")
    op.drop_column("anonymisation_jobs", "monitor_status")
    op.drop_column("anonymisation_jobs", "monitor_risk_percent")
    op.drop_column("anonymisation_jobs", "monitor_k")
    op.drop_column("anonymisation_jobs", "last_monitored_at")
    op.drop_column("anonymisation_jobs", "run_count")
    op.drop_column("anonymisation_jobs", "next_run_at")
    op.drop_column("anonymisation_jobs", "schedule")
    op.drop_column("anonymisation_jobs", "epsilon")
    sa.Enum(name="anonymisation_schedule").drop(op.get_bind(), checkfirst=True)
