"""Add developer_mode to consent_banners."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260630_developer_mode"
down_revision: Union[str, None] = "20260630_ab_variant_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consent_banners",
        sa.Column("developer_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("consent_banners", "developer_mode", server_default=None)


def downgrade() -> None:
    op.drop_column("consent_banners", "developer_mode")
