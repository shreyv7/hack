"""Add internal banner purpose fields to consent_banners."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260630_banner_purpose"
down_revision: Union[str, None] = "20260629_bu_scope"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consent_banners",
        sa.Column(
            "banner_purpose_type",
            sa.String(length=50),
            nullable=False,
            server_default="cookie",
        ),
    )
    op.add_column(
        "consent_banners",
        sa.Column("banner_purpose_custom", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_banners", "banner_purpose_custom")
    op.drop_column("consent_banners", "banner_purpose_type")
