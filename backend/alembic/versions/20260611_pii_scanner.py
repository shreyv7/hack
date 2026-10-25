"""pii scan jobs and findings

Revision ID: 20260611_pii
Revises: 20260611_retention
Create Date: 2026-06-11
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260611_pii"
down_revision: Union[str, None] = "20260611_retention"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

scan_status = postgresql.ENUM("running", "completed", "failed", name="pii_scan_status", create_type=False)
finding_status = postgresql.ENUM("detected", "dismissed", name="pii_finding_status", create_type=False)
# Reused — created by the data_inventory migration; never recreated here.
field_classification = postgresql.ENUM(
    "unclassified", "non_personal", "personal", "sensitive",
    name="field_classification", create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum("running", "completed", "failed", name="pii_scan_status").create(bind, checkfirst=True)
    sa.Enum("detected", "dismissed", name="pii_finding_status").create(bind, checkfirst=True)

    op.create_table(
        "pii_scan_jobs",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("data_source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", scan_status, server_default="running", nullable=False),
        sa.Column("sample_size", sa.Integer(), server_default="100", nullable=False),
        sa.Column("tables_scanned", sa.Integer(), server_default="0", nullable=False),
        sa.Column("columns_scanned", sa.Integer(), server_default="0", nullable=False),
        sa.Column("fields_flagged", sa.Integer(), server_default="0", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("triggered_by", sa.String(length=255), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["data_source_id"], ["data_sources.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pii_scan_jobs_organization_id", "pii_scan_jobs", ["organization_id"])
    op.create_index("ix_pii_scan_jobs_data_source_id", "pii_scan_jobs", ["data_source_id"])

    op.create_table(
        "pii_findings",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("field_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("table_name", sa.String(length=255), nullable=False),
        sa.Column("column_name", sa.String(length=255), nullable=False),
        sa.Column("pii_category", sa.String(length=64), nullable=False),
        sa.Column("classification", field_classification, nullable=False),
        sa.Column("match_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("sample_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("confidence", sa.Integer(), server_default="0", nullable=False),
        sa.Column("example_masked", sa.String(length=255), nullable=True),
        sa.Column("status", finding_status, server_default="detected", nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scan_job_id"], ["pii_scan_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["asset_id"], ["data_inventory_assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["field_id"], ["data_inventory_fields.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pii_findings_organization_id", "pii_findings", ["organization_id"])
    op.create_index("ix_pii_findings_scan_job_id", "pii_findings", ["scan_job_id"])


def downgrade() -> None:
    bind = op.get_bind()
    op.drop_index("ix_pii_findings_scan_job_id", table_name="pii_findings")
    op.drop_index("ix_pii_findings_organization_id", table_name="pii_findings")
    op.drop_table("pii_findings")
    op.drop_index("ix_pii_scan_jobs_data_source_id", table_name="pii_scan_jobs")
    op.drop_index("ix_pii_scan_jobs_organization_id", table_name="pii_scan_jobs")
    op.drop_table("pii_scan_jobs")
    sa.Enum(name="pii_finding_status").drop(bind, checkfirst=True)
    sa.Enum(name="pii_scan_status").drop(bind, checkfirst=True)
    # field_classification is owned by the data_inventory migration — not dropped here.
