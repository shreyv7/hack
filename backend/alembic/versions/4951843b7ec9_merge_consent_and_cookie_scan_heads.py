"""merge consent and cookie scan heads

Revision ID: 4951843b7ec9
Revises: 20260605_consent, dbca7c856c34
Create Date: 2026-06-05 22:24:54.362514

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4951843b7ec9'
down_revision: Union[str, None] = ('20260605_consent', 'dbca7c856c34')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
