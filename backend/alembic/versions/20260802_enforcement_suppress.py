"""Add suppress withdrawal action and default purpose mappings to suppress."""

from alembic import op

revision = "20260802_enforce_suppress"
down_revision = "20260801_withdraw_p3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL requires new enum values to be committed before they can be used.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE withdrawal_action ADD VALUE IF NOT EXISTS 'suppress' BEFORE 'mask'")
    op.execute(
        "ALTER TABLE purpose_data_mappings "
        "ALTER COLUMN withdrawal_action SET DEFAULT 'suppress'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE purpose_data_mappings "
        "ALTER COLUMN withdrawal_action SET DEFAULT 'mask'"
    )
    # PostgreSQL does not support removing enum values safely; suppress remains in the type.
