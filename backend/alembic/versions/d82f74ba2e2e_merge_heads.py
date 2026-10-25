"""merge heads

Revision ID: d82f74ba2e2e
Revises: 20260703_consent_portal_sms
Create Date: 2026-07-04 14:15:41.258476

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd82f74ba2e2e'
down_revision: Union[str, None] = "20260703_consent_portal_sms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
