"""Req 6 — retention actions, integration mode, evidentiary profiles."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260726_retention_req6"
down_revision = "20260725_dsar_req5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE data_source_integration_mode AS ENUM ('discovery', 'read_write')"
    )
    op.add_column(
        "data_sources",
        sa.Column(
            "integration_mode",
            sa.Enum("discovery", "read_write", name="data_source_integration_mode"),
            nullable=True,
        ),
    )

    op.execute("ALTER TYPE retention_action ADD VALUE IF NOT EXISTS 'mask'")
    op.execute("ALTER TYPE retention_action ADD VALUE IF NOT EXISTS 'pseudonymize'")

    op.add_column(
        "retention_policies",
        sa.Column("evidentiary_profile", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "organization_settings",
        sa.Column("retention_evidentiary_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "retention_evidentiary_config")
    op.drop_column("retention_policies", "evidentiary_profile")
    op.drop_column("data_sources", "integration_mode")
    op.execute("DROP TYPE IF EXISTS data_source_integration_mode")
