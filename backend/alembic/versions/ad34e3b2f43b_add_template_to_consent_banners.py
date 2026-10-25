"""add template to consent banners

Revision ID: ad34e3b2f43b
Revises: d60fbd44d8b7
Create Date: 2026-06-08 17:12:13.054546

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ad34e3b2f43b'
down_revision: Union[str, None] = 'd60fbd44d8b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('consent_banners', sa.Column('template', sa.String(length=100), nullable=False, server_default='classic'))


def downgrade() -> None:
    op.drop_column('consent_banners', 'template')
