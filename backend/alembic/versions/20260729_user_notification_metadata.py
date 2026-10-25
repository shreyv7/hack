"""Add category, action_url, severity to user_notifications.

Revision ID: 20260729_notif_meta
Revises: 20260729_drop_legacy_consent
Create Date: 2026-07-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_notif_meta"
down_revision: Union[str, None] = "20260729_drop_legacy_consent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_notifications",
        sa.Column("category", sa.String(length=50), nullable=False, server_default="system"),
    )
    op.add_column(
        "user_notifications",
        sa.Column("action_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "user_notifications",
        sa.Column("severity", sa.String(length=20), nullable=False, server_default="info"),
    )
    op.create_index(
        op.f("ix_user_notifications_recipient_unread"),
        "user_notifications",
        ["organization_id", "recipient_id", "is_read"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_notifications_recipient_unread"), table_name="user_notifications")
    op.drop_column("user_notifications", "severity")
    op.drop_column("user_notifications", "action_url")
    op.drop_column("user_notifications", "category")
