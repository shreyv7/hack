"""add dpo and it_admin user roles

Revision ID: 20260708_add_dpo_it_admin_roles
Revises: 20260707_expand_rbac
Create Date: 2026-07-08
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260708_add_dpo_it_admin_roles"
down_revision: Union[str, None] = "20260707_expand_rbac"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_ROLES = ("dpo", "it_admin")


def upgrade() -> None:
    # PostgreSQL enums can only be extended, never shrunk — use IF NOT EXISTS to
    # make this idempotent across repeated local runs.
    for role in NEW_ROLES:
        op.execute(
            f"ALTER TYPE user_role ADD VALUE IF NOT EXISTS '{role}';"
        )


def downgrade() -> None:
    # PostgreSQL does not support removing enum values once they exist.
    # To reverse, recreate the enum without the values and migrate columns —
    # omitted here since this is a local-dev migration.
    pass
