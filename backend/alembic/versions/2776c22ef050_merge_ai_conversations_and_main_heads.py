"""merge ai_conversations and main heads

Revision ID: 2776c22ef050
Revises: 20260618_ai_conv, d925e476e277
Create Date: 2026-06-18 19:45:38.730182

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2776c22ef050'
down_revision: Union[str, None] = ('20260618_ai_conv', 'd925e476e277')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
