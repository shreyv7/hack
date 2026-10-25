"""Req 8 — RoPA banking context, data-source links, retention FK, system property/channel."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260729_ropa_banking"
down_revision = "20260728_req3_banners"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "processing_activities",
        sa.Column("banking_context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.add_column(
        "activity_systems",
        sa.Column(
            "property_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("integration_properties.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "activity_systems",
        sa.Column("channel", sa.String(64), nullable=True),
    )
    op.create_index("ix_activity_systems_property_id", "activity_systems", ["property_id"])

    op.add_column(
        "activity_retention_policies",
        sa.Column(
            "retention_policy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("retention_policies.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_activity_retention_policies_retention_policy_id",
        "activity_retention_policies",
        ["retention_policy_id"],
    )

    op.create_table(
        "activity_data_sources",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "activity_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("processing_activities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "data_source_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("data_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(16), nullable=False, server_default="primary"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("activity_id", "data_source_id", name="uq_activity_data_sources_unique"),
    )
    op.create_index("ix_activity_data_sources_activity_id", "activity_data_sources", ["activity_id"])
    op.create_index("ix_activity_data_sources_data_source_id", "activity_data_sources", ["data_source_id"])


def downgrade() -> None:
    op.drop_index("ix_activity_data_sources_data_source_id", table_name="activity_data_sources")
    op.drop_index("ix_activity_data_sources_activity_id", table_name="activity_data_sources")
    op.drop_table("activity_data_sources")

    op.drop_index("ix_activity_retention_policies_retention_policy_id", table_name="activity_retention_policies")
    op.drop_column("activity_retention_policies", "retention_policy_id")

    op.drop_index("ix_activity_systems_property_id", table_name="activity_systems")
    op.drop_column("activity_systems", "channel")
    op.drop_column("activity_systems", "property_id")

    op.drop_column("processing_activities", "banking_context")
