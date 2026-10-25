"""DSAR request activity log

Revision ID: 20260613_dsar_activity
Revises: 20260612_india_phone
Create Date: 2026-06-13
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260613_dsar_activity"
down_revision: Union[str, None] = "20260612_india_phone"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

data_right_type = postgresql.ENUM(
    "access",
    "correction",
    "erasure",
    "nomination",
    "grievance",
    "withdraw_consent",
    name="data_right_type",
    create_type=False,
)
activity_action = postgresql.ENUM(
    "request_created",
    "identity_verified",
    "status_changed",
    "assigned",
    "unassigned",
    "grievance_acknowledged",
    "resolved",
    name="data_rights_activity_action",
    create_type=False,
)


def upgrade() -> None:
    activity_action.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "data_rights_activity_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("tracking_id", sa.String(length=32), nullable=False),
        sa.Column("right_type", data_right_type, nullable=False),
        sa.Column("action", activity_action, nullable=False),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("actor_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("assignee_user_id", sa.UUID(), nullable=True),
        sa.Column("assignee_name", sa.String(length=255), nullable=True),
        sa.Column("message", sa.Text(), nullable=False, server_default=""),
        sa.Column("event_metadata", postgresql.JSON(astext_type=sa.Text()), nullable=False, server_default="{}"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["request_id"], ["data_rights_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assignee_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_data_rights_activity_events_org_created",
        "data_rights_activity_events",
        ["organization_id", "created_at"],
    )
    op.create_index(
        "ix_data_rights_activity_events_tracking_id",
        "data_rights_activity_events",
        ["tracking_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_data_rights_activity_events_tracking_id", table_name="data_rights_activity_events")
    op.drop_index("ix_data_rights_activity_events_org_created", table_name="data_rights_activity_events")
    op.drop_table("data_rights_activity_events")
    activity_action.drop(op.get_bind(), checkfirst=True)
