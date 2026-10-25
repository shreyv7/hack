"""data sources registry

Revision ID: 20260608_datasrc
Revises: 5802517017f8
Create Date: 2026-06-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_datasrc"
down_revision: Union[str, None] = "5802517017f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

data_source_type = postgresql.ENUM(
    "postgresql",
    "mysql",
    "mongodb",
    "s3",
    "azure_blob",
    "bigquery",
    "snowflake",
    "salesforce",
    "api",
    "other",
    name="data_source_type",
    create_type=False,
)
data_source_status = postgresql.ENUM(
    "pending",
    "connected",
    "error",
    name="data_source_status",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum(
        "postgresql",
        "mysql",
        "mongodb",
        "s3",
        "azure_blob",
        "bigquery",
        "snowflake",
        "salesforce",
        "api",
        "other",
        name="data_source_type",
    ).create(bind, checkfirst=True)
    sa.Enum("pending", "connected", "error", name="data_source_status").create(
        bind, checkfirst=True
    )

    op.create_table(
        "data_sources",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("source_type", data_source_type, nullable=False),
        sa.Column("region", sa.String(length=128), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("host", sa.String(length=255), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("database_name", sa.String(length=255), nullable=True),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("password", sa.String(length=512), nullable=True),
        sa.Column("ssl_enabled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "extra_config",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("status", data_source_status, server_default="pending", nullable=False),
        sa.Column("last_tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
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
    op.create_index("ix_data_sources_organization_id", "data_sources", ["organization_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_data_sources_organization_id", table_name="data_sources")
    op.drop_table("data_sources")
    sa.Enum(name="data_source_status").drop(bind, checkfirst=True)
    sa.Enum(name="data_source_type").drop(bind, checkfirst=True)
