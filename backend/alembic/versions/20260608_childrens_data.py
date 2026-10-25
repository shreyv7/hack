"""children's data records (DPDPA Section 9)

Revision ID: 20260608_children
Revises: 20260608_datainv
Create Date: 2026-06-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_children"
down_revision: Union[str, None] = "20260608_datainv"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

child_consent_status = postgresql.ENUM(
    "missing",
    "pending",
    "verified",
    "expired",
    name="child_consent_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum(
        "missing",
        "pending",
        "verified",
        "expired",
        name="child_consent_status",
    ).create(bind, checkfirst=True)

    op.create_table(
        "child_data_records",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("child_ref", sa.String(length=64), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("detection_method", sa.String(length=64), nullable=True),
        sa.Column("consent_status", child_consent_status, server_default="missing", nullable=False),
        sa.Column("parent_name", sa.String(length=255), nullable=True),
        sa.Column("parent_email", sa.String(length=320), nullable=True),
        sa.Column("parent_relationship", sa.String(length=64), nullable=True),
        sa.Column("consent_verification_method", sa.String(length=64), nullable=True),
        sa.Column("consent_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("profiling_blocked", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("ad_targeting_blocked", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_child_data_records_organization_id", "child_data_records", ["organization_id"]
    )
    op.create_index("ix_child_data_records_child_ref", "child_data_records", ["child_ref"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_child_data_records_child_ref", table_name="child_data_records")
    op.drop_index("ix_child_data_records_organization_id", table_name="child_data_records")
    op.drop_table("child_data_records")
    sa.Enum(name="child_consent_status").drop(bind, checkfirst=True)
