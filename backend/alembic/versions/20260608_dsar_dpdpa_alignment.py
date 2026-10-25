"""DSAR DPDPA 2023 alignment — received_at, grievance ack, org SLA config

Revision ID: 20260608_dpdpa
Revises: 20260608_dsar
Create Date: 2026-06-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_dpdpa"
down_revision: Union[str, None] = "20260608_dsar"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE dsar_reminder_type ADD VALUE IF NOT EXISTS 'ack_due'")
    op.execute("ALTER TYPE dsar_reminder_type ADD VALUE IF NOT EXISTS 'ack_overdue'")

    op.add_column(
        "data_rights_requests",
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("ack_due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("ack_breached_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("data_rights_requests", "due_at", existing_type=sa.DateTime(timezone=True), nullable=True)

    op.add_column(
        "organization_settings",
        sa.Column("dsar_sla_config", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )

    # Backfill: verified requests — SLA clock from created_at (best-effort for existing rows)
    op.execute(
        """
        UPDATE data_rights_requests
        SET received_at = created_at
        WHERE verification_status = 'verified' AND received_at IS NULL
        """
    )
    op.execute(
        """
        UPDATE data_rights_requests
        SET ack_due_at = received_at + INTERVAL '24 hours'
        WHERE right_type = 'grievance'
          AND received_at IS NOT NULL
          AND ack_due_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "dsar_sla_config")
    op.drop_column("data_rights_requests", "ack_breached_at")
    op.drop_column("data_rights_requests", "acknowledged_at")
    op.drop_column("data_rights_requests", "ack_due_at")
    op.drop_column("data_rights_requests", "received_at")
    op.alter_column("data_rights_requests", "due_at", existing_type=sa.DateTime(timezone=True), nullable=False)
