"""Req 5 — Data Rights Portal: masking/anonymization rights and fulfillment metadata."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260725_dsar_req5"
down_revision = "20260724_proof_vault_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE data_right_type ADD VALUE IF NOT EXISTS 'masking'")
    op.execute("ALTER TYPE data_right_type ADD VALUE IF NOT EXISTS 'anonymization'")
    op.execute(
        "ALTER TYPE data_rights_activity_action ADD VALUE IF NOT EXISTS 'comment_added'"
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("fulfillment_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("retention_hold_applied", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("data_rights_requests", "retention_hold_applied")
    op.drop_column("data_rights_requests", "fulfillment_metadata")
    # PostgreSQL enums cannot drop values safely — left in place on downgrade
