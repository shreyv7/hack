"""add_consent_valid_days

Revision ID: 66cd528dbd9c
Revises: 20260630_tag_manager_enterprise
Create Date: 2026-07-01 15:53:43.226476

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '66cd528dbd9c'
down_revision: Union[str, None] = '20260630_tag_manager_enterprise'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('consent_banners', sa.Column('consent_valid_days', sa.Integer(), nullable=False, server_default='365'))


def downgrade() -> None:
    op.drop_column('consent_banners', 'consent_valid_days')

