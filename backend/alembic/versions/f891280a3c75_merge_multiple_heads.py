"""Merge multiple heads

Revision ID: f891280a3c75
Revises: 20260613_dsar_activity, 57641952e38d, ad75a9d73879
Create Date: 2026-06-15 08:49:50.178473

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f891280a3c75'
down_revision: Union[str, None] = ('20260613_dsar_activity', '57641952e38d', 'ad75a9d73879')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
