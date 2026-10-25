"""data inventory assets and fields

Revision ID: 20260608_datainv
Revises: 20260608_datasrc
Create Date: 2026-06-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_datainv"
down_revision: Union[str, None] = "20260608_datasrc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

asset_type = postgresql.ENUM(
    "database",
    "application",
    "file_system",
    "api",
    "table",
    "collection",
    "warehouse",
    "other",
    name="asset_type",
    create_type=False,
)
asset_status = postgresql.ENUM(
    "active",
    "review_needed",
    "archived",
    name="asset_status",
    create_type=False,
)
field_classification = postgresql.ENUM(
    "unclassified",
    "non_personal",
    "personal",
    "sensitive",
    name="field_classification",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum(
        "database",
        "application",
        "file_system",
        "api",
        "table",
        "collection",
        "warehouse",
        "other",
        name="asset_type",
    ).create(bind, checkfirst=True)
    sa.Enum("active", "review_needed", "archived", name="asset_status").create(
        bind, checkfirst=True
    )
    sa.Enum(
        "unclassified",
        "non_personal",
        "personal",
        "sensitive",
        name="field_classification",
    ).create(bind, checkfirst=True)

    op.create_table(
        "data_inventory_assets",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("asset_type", asset_type, nullable=False),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("owner", sa.String(length=255), nullable=True),
        sa.Column("record_count", sa.String(length=64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "data_categories",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("status", asset_status, server_default="active", nullable=False),
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
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_inventory_assets_organization_id", "data_inventory_assets", ["organization_id"]
    )
    op.create_index(
        "ix_data_inventory_assets_data_source_id", "data_inventory_assets", ["data_source_id"]
    )

    op.create_table(
        "data_inventory_fields",
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("data_type", sa.String(length=128), nullable=True),
        sa.Column(
            "classification",
            field_classification,
            server_default="unclassified",
            nullable=False,
        ),
        sa.Column("pii_category", sa.String(length=64), nullable=True),
        sa.Column("is_encrypted", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
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
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_inventory_fields_asset_id", "data_inventory_fields", ["asset_id"]
    )


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_data_inventory_fields_asset_id", table_name="data_inventory_fields")
    op.drop_table("data_inventory_fields")
    op.drop_index("ix_data_inventory_assets_data_source_id", table_name="data_inventory_assets")
    op.drop_index("ix_data_inventory_assets_organization_id", table_name="data_inventory_assets")
    op.drop_table("data_inventory_assets")
    sa.Enum(name="field_classification").drop(bind, checkfirst=True)
    sa.Enum(name="asset_status").drop(bind, checkfirst=True)
    sa.Enum(name="asset_type").drop(bind, checkfirst=True)
