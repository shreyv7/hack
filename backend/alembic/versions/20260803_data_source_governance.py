"""Add data source governance fields and activity audit table."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260803_data_source_gov"
down_revision = "20260802_enforce_suppress"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE data_source_environment AS ENUM "
        "('production', 'staging', 'development', 'test')"
    )
    op.execute(
        "CREATE TYPE data_source_criticality AS ENUM "
        "('low', 'medium', 'high', 'critical')"
    )

    op.add_column(
        "data_sources",
        sa.Column("owner_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("data_sources", sa.Column("owner_name", sa.String(255), nullable=True))
    op.add_column(
        "data_sources",
        sa.Column(
            "environment",
            sa.Enum(
                "production",
                "staging",
                "development",
                "test",
                name="data_source_environment",
                create_type=False,
            ),
            nullable=False,
            server_default="production",
        ),
    )
    op.add_column(
        "data_sources",
        sa.Column(
            "criticality",
            sa.Enum(
                "low",
                "medium",
                "high",
                "critical",
                name="data_source_criticality",
                create_type=False,
            ),
            nullable=False,
            server_default="medium",
        ),
    )
    op.add_column(
        "data_sources",
        sa.Column("data_processor_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "data_sources",
        sa.Column("encryption_at_rest", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "data_sources",
        sa.Column("credential_rotated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "data_sources",
        sa.Column("tags", postgresql.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "data_sources",
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "data_sources",
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    op.create_foreign_key(
        "fk_data_sources_owner_user_id",
        "data_sources",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_data_sources_data_processor_id",
        "data_sources",
        "data_processors",
        ["data_processor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_data_sources_created_by_user_id",
        "data_sources",
        "users",
        ["created_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_data_sources_updated_by_user_id",
        "data_sources",
        "users",
        ["updated_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_data_sources_owner_user_id", "data_sources", ["owner_user_id"])
    op.create_index("ix_data_sources_data_processor_id", "data_sources", ["data_processor_id"])

    op.create_table(
        "data_source_activities",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("source_name", sa.String(255), nullable=False),
        sa.Column("user_name", sa.String(255), nullable=False),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="SET NULL"),
    )
    op.create_index(
        "ix_data_source_activities_organization_id",
        "data_source_activities",
        ["organization_id"],
    )
    op.create_index(
        "ix_data_source_activities_data_source_id",
        "data_source_activities",
        ["data_source_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_data_source_activities_data_source_id", table_name="data_source_activities")
    op.drop_index("ix_data_source_activities_organization_id", table_name="data_source_activities")
    op.drop_table("data_source_activities")

    op.drop_index("ix_data_sources_data_processor_id", table_name="data_sources")
    op.drop_index("ix_data_sources_owner_user_id", table_name="data_sources")
    op.drop_constraint("fk_data_sources_updated_by_user_id", "data_sources", type_="foreignkey")
    op.drop_constraint("fk_data_sources_created_by_user_id", "data_sources", type_="foreignkey")
    op.drop_constraint("fk_data_sources_data_processor_id", "data_sources", type_="foreignkey")
    op.drop_constraint("fk_data_sources_owner_user_id", "data_sources", type_="foreignkey")

    op.drop_column("data_sources", "updated_by_user_id")
    op.drop_column("data_sources", "created_by_user_id")
    op.drop_column("data_sources", "tags")
    op.drop_column("data_sources", "credential_rotated_at")
    op.drop_column("data_sources", "encryption_at_rest")
    op.drop_column("data_sources", "data_processor_id")
    op.drop_column("data_sources", "criticality")
    op.drop_column("data_sources", "environment")
    op.drop_column("data_sources", "owner_name")
    op.drop_column("data_sources", "owner_user_id")

    op.execute("DROP TYPE data_source_criticality")
    op.execute("DROP TYPE data_source_environment")
