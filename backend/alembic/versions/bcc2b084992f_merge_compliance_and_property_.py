"""merge compliance and property deployment heads

Revision ID: bcc2b084992f
Revises: 20260609_compliance, 7d2c9834d4c4
Create Date: 2026-06-10 16:13:27.344113

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bcc2b084992f'
down_revision: Union[str, None] = ('20260609_compliance', '7d2c9834d4c4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
