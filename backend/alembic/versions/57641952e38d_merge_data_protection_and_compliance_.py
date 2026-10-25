"""merge data-protection and compliance migration heads

Revision ID: 57641952e38d
Revises: 20260611_rexec, 20260612_india_phone
Create Date: 2026-06-12 17:20:06.411841

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '57641952e38d'
down_revision: Union[str, None] = ('20260611_rexec', '20260612_india_phone')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
