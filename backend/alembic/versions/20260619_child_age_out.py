"""Add aged_out_at to child_data_records (auto age-out at 18).

Revision ID: 20260619_ageout
Revises: 20260619_ccreq
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260619_ageout"
down_revision = "20260619_ccreq"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "child_data_records",
        sa.Column("aged_out_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("child_data_records", "aged_out_at")
