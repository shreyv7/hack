"""Anonymisation Phase 2: record suppression + l-diversity threshold.

Revision ID: 20260623_anon2
Revises: 20260623_anon
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260623_anon2"
down_revision = "20260623_anon"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "anonymisation_jobs",
        sa.Column("l_threshold", sa.Integer(), server_default="2", nullable=False),
    )
    op.add_column(
        "anonymisation_jobs",
        sa.Column("records_suppressed", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("anonymisation_jobs", "records_suppressed")
    op.drop_column("anonymisation_jobs", "l_threshold")
