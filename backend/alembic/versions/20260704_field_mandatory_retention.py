"""add mandatory_retention (legal hold) columns to data_inventory_fields

Revision ID: 20260704_field_mand_ret
Revises: 20260703_consent_portal_sms
Create Date: 2026-07-04 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260704_field_mand_ret"
down_revision: Union[str, None] = "20260703_consent_portal_sms"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "data_inventory_fields",
        sa.Column("mandatory_retention", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "data_inventory_fields",
        sa.Column("mandatory_retention_days", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("data_inventory_fields", "mandatory_retention_days")
    op.drop_column("data_inventory_fields", "mandatory_retention")
