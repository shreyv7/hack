"""data rights requests and DSAR SLA reminders

Revision ID: 20260608_dsar
Revises: 20260605_consent
Create Date: 2026-06-08
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260608_dsar"
down_revision: Union[str, None] = "20260605_consent"
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
verification_status = postgresql.ENUM(
    "unverified",
    "verified",
    name="verification_status",
    create_type=False,
)
data_rights_request_status = postgresql.ENUM(
    "pending_verification",
    "received",
    "in_review",
    "response_ready",
    "completed",
    "rejected",
    name="data_rights_request_status",
    create_type=False,
)
dsar_reminder_type = postgresql.ENUM(
    "due_7d",
    "due_3d",
    "due_1d",
    "overdue",
    name="dsar_reminder_type",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum(
        "access",
        "correction",
        "erasure",
        "nomination",
        "grievance",
        "withdraw_consent",
        name="data_right_type",
    ).create(bind, checkfirst=True)
    sa.Enum("unverified", "verified", name="verification_status").create(bind, checkfirst=True)
    sa.Enum(
        "pending_verification",
        "received",
        "in_review",
        "response_ready",
        "completed",
        "rejected",
        name="data_rights_request_status",
    ).create(bind, checkfirst=True)
    sa.Enum("due_7d", "due_3d", "due_1d", "overdue", name="dsar_reminder_type").create(
        bind, checkfirst=True
    )

    op.create_table(
        "data_rights_requests",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tracking_id", sa.String(length=32), nullable=False),
        sa.Column("right_type", data_right_type, nullable=False),
        sa.Column("requester_name", sa.String(length=255), nullable=False),
        sa.Column("requester_email", sa.String(length=320), nullable=False),
        sa.Column("requester_phone", sa.String(length=32), nullable=True),
        sa.Column("request_details", sa.Text(), nullable=False),
        sa.Column(
            "extra_data",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("verification_method", sa.String(length=32), server_default="email", nullable=False),
        sa.Column(
            "verification_status",
            verification_status,
            server_default="unverified",
            nullable=False,
        ),
        sa.Column("otp_code_hash", sa.String(length=128), nullable=True),
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("otp_sent_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_otp_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "status",
            data_rights_request_status,
            server_default="pending_verification",
            nullable=False,
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("breached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("closure_text", sa.Text(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["resolved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tracking_id", name="uq_data_rights_requests_tracking_id"),
    )
    op.create_index("ix_data_rights_requests_organization_id", "data_rights_requests", ["organization_id"])
    op.create_index("ix_data_rights_requests_tracking_id", "data_rights_requests", ["tracking_id"])
    op.create_index("ix_data_rights_requests_requester_email", "data_rights_requests", ["requester_email"])

    op.create_table(
        "data_rights_reminder_events",
        sa.Column("request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("reminder_type", dsar_reminder_type, nullable=False),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("email_sent", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["request_id"], ["data_rights_requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("request_id", "reminder_type", name="uq_dsar_reminder_request_type"),
    )
    op.create_index(
        "ix_data_rights_reminder_events_request_id",
        "data_rights_reminder_events",
        ["request_id"],
    )


def downgrade() -> None:
    op.drop_table("data_rights_reminder_events")
    op.drop_table("data_rights_requests")
    bind = op.get_bind()
    sa.Enum("due_7d", "due_3d", "due_1d", "overdue", name="dsar_reminder_type").drop(bind, checkfirst=True)
    sa.Enum(
        "pending_verification",
        "received",
        "in_review",
        "response_ready",
        "completed",
        "rejected",
        name="data_rights_request_status",
    ).drop(bind, checkfirst=True)
    sa.Enum("unverified", "verified", name="verification_status").drop(bind, checkfirst=True)
    sa.Enum(
        "access",
        "correction",
        "erasure",
        "nomination",
        "grievance",
        "withdraw_consent",
        name="data_right_type",
    ).drop(bind, checkfirst=True)
