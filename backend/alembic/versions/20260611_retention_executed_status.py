"""add 'executed' value to retention_run_status

Revision ID: 20260611_rexec
Revises: 20260611_childref
Create Date: 2026-06-11
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260611_rexec"
down_revision: Union[str, None] = "20260611_childref"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE retention_run_status ADD VALUE IF NOT EXISTS 'executed'")


def downgrade() -> None:
    # Postgres can't drop an enum value without recreating the type.
    pass
