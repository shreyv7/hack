"""merge heads

Revision ID: ed233bd8cc8f
Revises: 20260623_anon3, efec79cdf4f2
Create Date: 2026-06-24 12:26:41.481729

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ed233bd8cc8f'
down_revision: Union[str, None] = ('20260623_anon3', 'efec79cdf4f2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
