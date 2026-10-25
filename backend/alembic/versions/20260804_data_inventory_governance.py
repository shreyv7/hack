"""Data inventory DPDPA governance — cross-border, safeguards, links, audit log."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260804_inventory_gov"
down_revision: Union[str, None] = "20260803_data_source_gov"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE security_safeguard AS ENUM "
        "('none', 'encryption', 'masking', 'obfuscation', 'tokenization')"
    )
    op.execute(
        "CREATE TYPE classification_source AS ENUM "
        "('manual', 'heuristic', 'pii_scanner')"
    )
    # inventory_audit_action is created by create_table below (not pre-created here).

    # Asset columns
    op.add_column("data_inventory_assets", sa.Column("country", sa.String(3), nullable=True))
    op.add_column(
        "data_inventory_assets",
        sa.Column("cross_border_transfer", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "data_inventory_assets",
        sa.Column("transfer_mechanism", sa.String(255), nullable=True),
    )
    op.add_column(
        "data_inventory_assets",
        sa.Column("dpia_required", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "data_inventory_assets",
        sa.Column("contains_child_data", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "data_inventory_assets",
        sa.Column("last_imported_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Field columns
    op.add_column(
        "data_inventory_fields",
        sa.Column(
            "security_safeguard",
            sa.Enum(
                "none",
                "encryption",
                "masking",
                "obfuscation",
                "tokenization",
                name="security_safeguard",
                create_type=False,
            ),
            server_default="none",
            nullable=False,
        ),
    )
    op.add_column(
        "data_inventory_fields",
        sa.Column(
            "classification_source",
            sa.Enum(
                "manual",
                "heuristic",
                "pii_scanner",
                name="classification_source",
                create_type=False,
            ),
            server_default="manual",
            nullable=False,
        ),
    )
    op.add_column(
        "data_inventory_fields",
        sa.Column("is_child_data", sa.Boolean(), server_default="false", nullable=False),
    )

    # Backfill security_safeguard from is_encrypted
    op.execute(
        "UPDATE data_inventory_fields SET security_safeguard = 'encryption' "
        "WHERE is_encrypted = true"
    )

    # Asset ↔ processor link table
    op.create_table(
        "data_inventory_asset_processors",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("processor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_categories_shared", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["processor_id"], ["data_processors.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "processor_id", name="uq_inventory_asset_processor"),
    )
    op.create_index(
        "ix_data_inventory_asset_processors_asset_id",
        "data_inventory_asset_processors",
        ["asset_id"],
    )
    op.create_index(
        "ix_data_inventory_asset_processors_processor_id",
        "data_inventory_asset_processors",
        ["processor_id"],
    )

    # Asset ↔ activity link table
    op.create_table(
        "data_inventory_asset_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("activity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_id"], ["processing_activities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "activity_id", name="uq_inventory_asset_activity"),
    )
    op.create_index(
        "ix_data_inventory_asset_activities_asset_id",
        "data_inventory_asset_activities",
        ["asset_id"],
    )
    op.create_index(
        "ix_data_inventory_asset_activities_activity_id",
        "data_inventory_asset_activities",
        ["activity_id"],
    )

    # Audit log table
    op.create_table(
        "data_inventory_audit_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "action",
            sa.Enum("created", "updated", "deleted", name="inventory_audit_action"),
            nullable=False,
        ),
        sa.Column("field_name", sa.String(128), nullable=True),
        sa.Column("old_value", sa.Text(), nullable=True),
        sa.Column("new_value", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["field_id"], ["data_inventory_fields.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_inventory_audit_logs_organization_id",
        "data_inventory_audit_logs",
        ["organization_id"],
    )
    op.create_index(
        "ix_data_inventory_audit_logs_asset_id",
        "data_inventory_audit_logs",
        ["asset_id"],
    )
    op.create_index(
        "ix_data_inventory_audit_logs_field_id",
        "data_inventory_audit_logs",
        ["field_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_data_inventory_audit_logs_field_id", "data_inventory_audit_logs")
    op.drop_index("ix_data_inventory_audit_logs_asset_id", "data_inventory_audit_logs")
    op.drop_index("ix_data_inventory_audit_logs_organization_id", "data_inventory_audit_logs")
    op.drop_table("data_inventory_audit_logs")

    op.drop_index("ix_data_inventory_asset_activities_activity_id", "data_inventory_asset_activities")
    op.drop_index("ix_data_inventory_asset_activities_asset_id", "data_inventory_asset_activities")
    op.drop_table("data_inventory_asset_activities")

    op.drop_index("ix_data_inventory_asset_processors_processor_id", "data_inventory_asset_processors")
    op.drop_index("ix_data_inventory_asset_processors_asset_id", "data_inventory_asset_processors")
    op.drop_table("data_inventory_asset_processors")

    op.drop_column("data_inventory_fields", "is_child_data")
    op.drop_column("data_inventory_fields", "classification_source")
    op.drop_column("data_inventory_fields", "security_safeguard")

    op.drop_column("data_inventory_assets", "last_imported_at")
    op.drop_column("data_inventory_assets", "contains_child_data")
    op.drop_column("data_inventory_assets", "dpia_required")
    op.drop_column("data_inventory_assets", "transfer_mechanism")
    op.drop_column("data_inventory_assets", "cross_border_transfer")
    op.drop_column("data_inventory_assets", "country")

    op.execute("DROP TYPE IF EXISTS inventory_audit_action")
    op.execute("DROP TYPE IF EXISTS classification_source")
    op.execute("DROP TYPE IF EXISTS security_safeguard")
