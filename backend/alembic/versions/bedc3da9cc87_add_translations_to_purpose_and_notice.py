"""add translations to purpose and notice

Revision ID: bedc3da9cc87
Revises: d925e476e277
Create Date: 2026-06-18 17:55:12.222051

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'bedc3da9cc87'
down_revision: Union[str, None] = 'd925e476e277'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('purpose_versions', sa.Column('translations', postgresql.JSON(astext_type=sa.Text()), server_default='{}', nullable=True))
    op.add_column('consent_notice_versions', sa.Column('translations', postgresql.JSON(astext_type=sa.Text()), server_default='{}', nullable=True))


def downgrade() -> None:
    op.drop_column('purpose_versions', 'translations')
    op.drop_column('consent_notice_versions', 'translations')

