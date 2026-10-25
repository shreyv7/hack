"""masking rules

Revision ID: 20260611_masking
Revises: 20260611_pii
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260611_masking"
down_revision: Union[str, None] = "20260611_pii"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

masking_strategy = postgresql.ENUM(
    "mask", "redact", "hash", "replace", "encrypt", "generalize",
    name="masking_strategy", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum(
        "mask", "redact", "hash", "replace", "encrypt", "generalize", name="masking_strategy"
    ).create(bind, checkfirst=True)

    op.create_table(
        "masking_rules",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("pii_category", sa.String(length=64), nullable=False),
        sa.Column("strategy", masking_strategy, nullable=False),
        sa.Column("params", postgresql.JSON(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "pii_category", name="uq_masking_rule_org_category"),
    )
    op.create_index("ix_masking_rules_organization_id", "masking_rules", ["organization_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_masking_rules_organization_id", table_name="masking_rules")
    op.drop_table("masking_rules")
    sa.Enum(name="masking_strategy").drop(bind, checkfirst=True)
