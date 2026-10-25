"""add anonymisation_download_logs (download audit) + merge heads

Revision ID: 20260706_anon_dl_log
Revises: 20260705_ret_obligations, a98d3821f619
Create Date: 2026-07-06 00:00:00.000000

Also merges the two open heads (retention obligations + cross-border transfer)
into a single head.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "20260706_anon_dl_log"
down_revision: Union[str, Sequence[str], None] = ("20260705_ret_obligations", "a98d3821f619")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "anonymisation_download_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("job_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("downloaded_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("downloaded_by_email", sa.String(length=320), nullable=True),
        sa.Column("file_name", sa.String(length=512), nullable=True),
        sa.Column("purpose", sa.Text(), nullable=False),
        sa.Column("shared_with", sa.String(length=512), nullable=False),
        sa.Column("recipient_type", sa.String(length=64), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["job_id"], ["anonymisation_jobs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["downloaded_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_anon_download_logs_org", "anonymisation_download_logs", ["organization_id"])
    op.create_index("ix_anon_download_logs_job", "anonymisation_download_logs", ["job_id"])


def downgrade() -> None:
    op.drop_index("ix_anon_download_logs_job", table_name="anonymisation_download_logs")
    op.drop_index("ix_anon_download_logs_org", table_name="anonymisation_download_logs")
    op.drop_table("anonymisation_download_logs")
