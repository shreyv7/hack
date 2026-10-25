"""Parental consent-collection workflow fields on child_data_records.

Adds the columns backing the emailed parent self-service consent flow:
a one-time link token, request timestamps, and an audit-evidence blob.

Revision ID: 20260619_ccreq
Revises: 20260619_dstax
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers, used by Alembic.
revision = "20260619_ccreq"
down_revision = "20260619_dstax"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("child_data_records", sa.Column("consent_token", sa.String(length=64), nullable=True))
    op.add_column("child_data_records", sa.Column("consent_requested_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("child_data_records", sa.Column("consent_request_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("child_data_records", sa.Column("consent_evidence", JSON(), nullable=True))
    op.create_index(
        "ix_child_data_records_consent_token", "child_data_records", ["consent_token"]
    )


def downgrade() -> None:
    op.drop_index("ix_child_data_records_consent_token", table_name="child_data_records")
    op.drop_column("child_data_records", "consent_evidence")
    op.drop_column("child_data_records", "consent_request_expires_at")
    op.drop_column("child_data_records", "consent_requested_at")
    op.drop_column("child_data_records", "consent_token")
