"""Add AB variant fields to consent_banners."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260630_ab_variant_fields"
down_revision: Union[str, None] = "20260630_banner_purpose"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consent_banners",
        sa.Column("ab_variant_display_style", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "consent_banners",
        sa.Column("ab_variant_position", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "consent_banners",
        sa.Column("ab_variant_template", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "consent_banners",
        sa.Column("ab_variant_custom_css", sa.String(length=2500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_banners", "ab_variant_custom_css")
    op.drop_column("consent_banners", "ab_variant_template")
    op.drop_column("consent_banners", "ab_variant_position")
    op.drop_column("consent_banners", "ab_variant_display_style")
