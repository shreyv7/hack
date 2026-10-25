"""add custom css to consent banners

Revision ID: 73e25cd29180
Revises: 27268e251455
Create Date: 2026-06-07 21:28:49.047673

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73e25cd29180'
down_revision: Union[str, None] = '27268e251455'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('consent_banners', sa.Column('custom_css', sa.String(length=2000), nullable=True))


def downgrade() -> None:
    op.drop_column('consent_banners', 'custom_css')

