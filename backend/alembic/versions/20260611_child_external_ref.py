"""add external_ref to child_data_records (enforcement matching)

Revision ID: 20260611_childref
Revises: 20260611_masking
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260611_childref"
down_revision: Union[str, None] = "20260611_masking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("child_data_records", sa.Column("external_ref", sa.String(length=255), nullable=True))
    op.create_index("ix_child_data_records_external_ref", "child_data_records", ["external_ref"])


def downgrade() -> None:
    op.drop_index("ix_child_data_records_external_ref", table_name="child_data_records")
    op.drop_column("child_data_records", "external_ref")
