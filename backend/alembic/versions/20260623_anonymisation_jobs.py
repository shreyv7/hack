"""Add anonymisation_jobs table (Data Anonymisation Phase 1).

Revision ID: 20260623_anon
Revises: 20260619_ageout
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

# revision identifiers, used by Alembic.
revision = "20260623_anon"
down_revision = "20260619_ageout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    technique = sa.Enum(
        "k_anonymity", "l_diversity", "differential_privacy", "pseudonymization",
        "generalization", "suppression", "date_shifting",
        name="anonymisation_technique",
    )
    job_status = sa.Enum(
        "pending", "running", "completed", "failed", name="anonymisation_job_status"
    )

    op.create_table(
        "anonymisation_jobs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "organization_id", UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True,
        ),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column(
            "asset_id", UUID(as_uuid=True),
            sa.ForeignKey("data_inventory_assets.id", ondelete="SET NULL"), nullable=True, index=True,
        ),
        sa.Column("dataset_name", sa.String(255), nullable=True),
        sa.Column("source_label", sa.String(255), nullable=True),
        sa.Column("technique", technique, nullable=False),
        sa.Column("k_threshold", sa.Integer(), server_default="25", nullable=False),
        sa.Column("field_rules", JSON(), server_default="[]", nullable=False),
        sa.Column("status", job_status, server_default="pending", nullable=False),
        sa.Column("records_processed", sa.Integer(), server_default="0", nullable=False),
        sa.Column("k_value", sa.Integer(), nullable=True),
        sa.Column("risk_percent", sa.Float(), nullable=True),
        sa.Column("risk_level", sa.String(16), nullable=True),
        sa.Column("output_filename", sa.String(255), nullable=True),
        sa.Column("output_path", sa.String(1024), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("anonymisation_jobs")
    sa.Enum(name="anonymisation_job_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="anonymisation_technique").drop(op.get_bind(), checkfirst=True)
