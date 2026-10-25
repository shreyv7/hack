"""expand consent banner custom css limit to 2500

Revision ID: 20260607_css_2500
Revises: 73e25cd29180
Create Date: 2026-06-07 23:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "20260607_css_2500"
down_revision: Union[str, None] = "73e25cd29180"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "consent_banners",
        "custom_css",
        existing_type=sa.String(length=2000),
        type_=sa.String(length=2500),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "consent_banners",
        "custom_css",
        existing_type=sa.String(length=2500),
        type_=sa.String(length=2000),
        existing_nullable=True,
    )
