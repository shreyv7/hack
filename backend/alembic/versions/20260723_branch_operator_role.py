"""Add branch_operator user role."""

from alembic import op

revision = "20260723_branch_op"
down_revision = "20260723_cap_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'branch_operator'")


def downgrade() -> None:
    pass
