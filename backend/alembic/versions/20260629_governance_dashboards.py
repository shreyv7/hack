"""Governance compliance dashboards module tables.

Revision ID: 20260629_governance_dashboards
Revises: 20260625_doc_embeddings
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID

revision: str = "20260629_governance_dashboards"
down_revision: Union[str, None] = "20260625_doc_embeddings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _enum(name: str, values: list[str]) -> ENUM:
    e = ENUM(*values, name=name, create_type=False)
    e.create(op.get_bind(), checkfirst=True)
    return e


def upgrade() -> None:
    visibility = _enum("governance_dashboard_visibility", ["private", "workspace", "organization"])
    permission = _enum("governance_dashboard_permission", ["read", "editor", "owner"])
    widget_type = _enum(
        "governance_widget_type",
        [
            "kpi_card", "line_chart", "bar_chart", "pie_chart", "donut_chart", "heatmap",
            "table", "list", "compliance_card", "deadlines", "risk_matrix", "incident_timeline",
            "scorecard", "progress_bar", "map", "markdown", "ai_summary",
        ],
    )
    data_source = _enum(
        "governance_widget_data_source",
        [
            "consent", "proof_vault", "rights", "dpia", "ropa", "policy", "vendor_risk",
            "security", "breach", "audit", "monitoring", "compliance_score", "module_health",
        ],
    )
    frequency = _enum("governance_schedule_frequency", ["daily", "weekly", "monthly", "quarterly", "custom"])
    delivery = _enum("governance_delivery_channel", ["email", "slack", "teams", "webhook"])
    export_fmt = _enum("governance_export_format", ["pdf", "xlsx", "csv", "pptx", "png", "json"])

    op.create_table(
        "governance_dashboards",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("visibility", visibility, nullable=False),
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("template_key", sa.String(80), nullable=True),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_favourite", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("layout_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("filters_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("auto_refresh_seconds", sa.Integer(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_refreshed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "slug", name="uq_governance_dashboard_org_slug"),
    )
    op.create_index("ix_governance_dashboards_organization_id", "governance_dashboards", ["organization_id"])
    op.create_index("ix_governance_dashboards_slug", "governance_dashboards", ["slug"])

    op.create_table(
        "governance_widgets",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("widget_type", widget_type, nullable=False),
        sa.Column("data_source", data_source, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("config_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("layout_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_governance_widgets_dashboard_id", "governance_widgets", ["dashboard_id"])

    op.create_table(
        "governance_dashboard_shares",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shared_with_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("shared_with_role", sa.String(40), nullable=True),
        sa.Column("permission", permission, nullable=False),
        sa.Column("public_token", sa.String(64), nullable=True, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "governance_dashboard_schedules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("frequency", frequency, nullable=False),
        sa.Column("cron_expression", sa.String(120), nullable=True),
        sa.Column("delivery_channel", delivery, nullable=False),
        sa.Column("delivery_config_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("export_format", export_fmt, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "governance_dashboard_versions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("snapshot_json", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("dashboard_id", "version_number", name="uq_governance_dashboard_version"),
    )

    op.create_table(
        "governance_dashboard_favorites",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "dashboard_id", name="uq_governance_dashboard_favorite"),
    )

    op.create_table(
        "governance_dashboard_audits",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("dashboard_id", UUID(as_uuid=True), sa.ForeignKey("governance_dashboards.id", ondelete="SET NULL"), nullable=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(80), nullable=False),
        sa.Column("details_json", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("governance_dashboard_audits")
    op.drop_table("governance_dashboard_favorites")
    op.drop_table("governance_dashboard_versions")
    op.drop_table("governance_dashboard_schedules")
    op.drop_table("governance_dashboard_shares")
    op.drop_table("governance_widgets")
    op.drop_table("governance_dashboards")
    for name in [
        "governance_export_format",
        "governance_delivery_channel",
        "governance_schedule_frequency",
        "governance_widget_data_source",
        "governance_widget_type",
        "governance_dashboard_permission",
        "governance_dashboard_visibility",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {name}")
