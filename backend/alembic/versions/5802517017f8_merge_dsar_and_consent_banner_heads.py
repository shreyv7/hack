"""merge dsar and consent banner heads

Revision ID: 5802517017f8
Revises: 20260607_css_2500, 20260608_dpdpa
Create Date: 2026-06-08 15:37:50.095177

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5802517017f8'
down_revision: Union[str, None] = ('20260607_css_2500', '20260608_dpdpa')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
