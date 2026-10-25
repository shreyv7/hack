"""Req 9 — governance widget data sources: retention, data_sources."""

from alembic import op

revision = "20260730_req9_reporting"
down_revision = "20260729_ropa_banking"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for value in ("retention", "data_sources"):
        op.execute(
            f"ALTER TYPE governance_widget_data_source ADD VALUE IF NOT EXISTS '{value}'"
        )


def downgrade() -> None:
    pass
