"""Add per-org DSAR portal form schemas

Revision ID: 20260611_portal_forms
Revises: 20260609_compliance
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260611_portal_forms"
down_revision: Union[str, None] = "20260609_compliance"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column("dsar_portal_forms", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "dsar_portal_forms")
