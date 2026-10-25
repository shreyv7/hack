"""signup: add pending org + pending_approval user statuses

Revision ID: 20260603_signup
Revises: 20260602_auth
Create Date: 2026-06-03

Adds two new enum values used by the self-service signup flow:
  * organization_status: "pending"
  * user_status: "pending_approval"

Note: PostgreSQL 12+ allows ALTER TYPE ... ADD VALUE inside a transaction as long
as the new value is not used in the same transaction (we only add it here). The
"IF NOT EXISTS" guard makes the migration safe to re-run.
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260603_signup"
down_revision: Union[str, None] = "20260602_auth"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE organization_status ADD VALUE IF NOT EXISTS 'pending'")
    op.execute("ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending_approval'")


def downgrade() -> None:
    # PostgreSQL cannot drop a single enum value without recreating the whole
    # type (and rewriting every column that uses it). Since adding a value is
    # backward-compatible, this downgrade is intentionally a no-op.
    pass
