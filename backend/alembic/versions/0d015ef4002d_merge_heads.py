"""merge heads

Revision ID: 0d015ef4002d
Revises: 20260701_consent_portal_email
Create Date: 2026-07-01 21:52:55.034619

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0d015ef4002d'
down_revision: Union[str, None] = "20260701_consent_portal_email"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
