"""add_legitimate_use_fields

Revision ID: a98d3821f619
Revises: d77d4a1b42d6
Create Date: 2026-07-06 15:05:56.083896

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a98d3821f619'
down_revision: Union[str, None] = 'd77d4a1b42d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add fields to purpose_versions
    op.add_column('purpose_versions', sa.Column('lia_summary', sa.Text(), nullable=True))
    op.add_column('purpose_versions', sa.Column('lia_reviewed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('purpose_versions', sa.Column('lia_reviewed_by', sa.String(length=255), nullable=True))

    # 2. Add fields to activity_lawful_bases
    op.add_column('activity_lawful_bases', sa.Column('lia_documented', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('activity_lawful_bases', sa.Column('lia_summary', sa.Text(), nullable=True))
    op.add_column('activity_lawful_bases', sa.Column('lia_last_reviewed_at', sa.DateTime(timezone=True), nullable=True))

    # 3. Add basis_type to consent_receipts
    op.add_column('consent_receipts', sa.Column('basis_type', sa.String(length=32), nullable=True))

    # 4. Add objection to data_right_type enum
    op.execute("ALTER TYPE data_right_type ADD VALUE IF NOT EXISTS 'objection'")


def downgrade() -> None:
    # 1. Remove columns from purpose_versions
    op.drop_column('purpose_versions', 'lia_reviewed_by')
    op.drop_column('purpose_versions', 'lia_reviewed_at')
    op.drop_column('purpose_versions', 'lia_summary')

    # 2. Remove columns from activity_lawful_bases
    op.drop_column('activity_lawful_bases', 'lia_last_reviewed_at')
    op.drop_column('activity_lawful_bases', 'lia_summary')
    op.drop_column('activity_lawful_bases', 'lia_documented')

    # 3. Remove basis_type from consent_receipts
    op.drop_column('consent_receipts', 'basis_type')

