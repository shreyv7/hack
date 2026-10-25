"""Drop legacy_consent_campaigns tables (consolidated into notice delivery).

Revision ID: 20260729_drop_legacy_consent
Revises: 20260729_merge_heads
Create Date: 2026-07-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260729_drop_legacy_consent"
down_revision: Union[str, None] = "20260729_merge_heads"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index(
        "ix_legacy_consent_campaign_recipients_campaign_id",
        table_name="legacy_consent_campaign_recipients",
    )
    op.drop_table("legacy_consent_campaign_recipients")
    op.drop_index(
        "ix_legacy_consent_campaigns_organization_id",
        table_name="legacy_consent_campaigns",
    )
    op.drop_table("legacy_consent_campaigns")
    sa.Enum(name="legacy_recipient_outcome").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="legacy_campaign_status").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # Tables recreated only if rolling back before notice-delivery consolidation shipped.
    from sqlalchemy.dialects import postgresql

    legacy_campaign_status = sa.Enum(
        "draft", "active", "completed", "cancelled", name="legacy_campaign_status"
    )
    legacy_recipient_outcome = sa.Enum(
        "pending",
        "delivered",
        "reconsented",
        "withdrawn",
        "no_response",
        name="legacy_recipient_outcome",
    )
    legacy_campaign_status.create(op.get_bind(), checkfirst=True)
    legacy_recipient_outcome.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "legacy_consent_campaigns",
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notice_version_id", sa.UUID(), nullable=True),
        sa.Column("status", legacy_campaign_status, nullable=False),
        sa.Column(
            "audience_filter",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "delivery_channels",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "reminder_schedule",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "stats",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(["notice_version_id"], ["consent_notice_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_legacy_consent_campaigns_organization_id",
        "legacy_consent_campaigns",
        ["organization_id"],
    )

    op.create_table(
        "legacy_consent_campaign_recipients",
        sa.Column("campaign_id", sa.UUID(), nullable=False),
        sa.Column("principal_email", sa.String(length=320), nullable=True),
        sa.Column("principal_phone", sa.String(length=32), nullable=True),
        sa.Column("consent_receipt_id", sa.UUID(), nullable=True),
        sa.Column("delivery_status", sa.String(length=64), nullable=False),
        sa.Column("last_reminder_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_count", sa.Integer(), nullable=False),
        sa.Column("outcome", legacy_recipient_outcome, nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
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
        sa.ForeignKeyConstraint(["campaign_id"], ["legacy_consent_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["consent_receipt_id"], ["consent_receipts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_legacy_consent_campaign_recipients_campaign_id",
        "legacy_consent_campaign_recipients",
        ["campaign_id"],
    )
