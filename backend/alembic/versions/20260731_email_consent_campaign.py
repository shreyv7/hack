"""Email consent campaign channel — campaign purpose, recipient sources, delivery tokens."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260731_email_campaign"
down_revision = "20260731_enforce_p1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "notice_campaigns",
        sa.Column("campaign_purpose", sa.String(50), nullable=False, server_default="notice_delivery"),
    )
    op.add_column("notice_campaigns", sa.Column("recipient_source", sa.String(50), nullable=True))
    op.add_column(
        "notice_campaigns",
        sa.Column("recipient_source_config", postgresql.JSONB(), nullable=False, server_default="{}"),
    )
    op.add_column(
        "notice_campaigns",
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "notice_campaigns",
        sa.Column("recipient_snapshot", postgresql.JSONB(), nullable=True),
    )
    op.create_foreign_key(
        "fk_notice_campaigns_property_id",
        "notice_campaigns",
        "integration_properties",
        ["property_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_notice_campaigns_property_id", "notice_campaigns", ["property_id"])

    op.add_column("campaign_deliveries", sa.Column("delivery_token", sa.String(512), nullable=True))
    op.add_column(
        "campaign_deliveries",
        sa.Column("capture_session_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "campaign_deliveries",
        sa.Column("consent_decision", sa.String(50), nullable=False, server_default="pending"),
    )
    op.add_column(
        "campaign_deliveries",
        sa.Column("consent_receipt_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_campaign_deliveries_capture_session_id",
        "campaign_deliveries",
        "consent_capture_sessions",
        ["capture_session_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_campaign_deliveries_consent_receipt_id",
        "campaign_deliveries",
        "consent_receipts",
        ["consent_receipt_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_campaign_deliveries_delivery_token", "campaign_deliveries", ["delivery_token"], unique=True)
    op.create_index("ix_campaign_deliveries_capture_session_id", "campaign_deliveries", ["capture_session_id"])
    op.create_index("ix_campaign_deliveries_consent_receipt_id", "campaign_deliveries", ["consent_receipt_id"])

    op.create_table(
        "campaign_recipient_uploads",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("campaign_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("original_filename", sa.String(512), nullable=False),
        sa.Column("stored_path", sa.String(1024), nullable=False),
        sa.Column("column_headers", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("field_map", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("normalized_rows", postgresql.JSONB(), nullable=True),
        sa.Column("row_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(50), nullable=False, server_default="uploaded"),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["campaign_id"], ["notice_campaigns.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_campaign_recipient_uploads_organization_id",
        "campaign_recipient_uploads",
        ["organization_id"],
    )
    op.create_index(
        "ix_campaign_recipient_uploads_campaign_id",
        "campaign_recipient_uploads",
        ["campaign_id"],
    )


def downgrade() -> None:
    op.drop_table("campaign_recipient_uploads")
    op.drop_index("ix_campaign_deliveries_consent_receipt_id", "campaign_deliveries")
    op.drop_index("ix_campaign_deliveries_capture_session_id", "campaign_deliveries")
    op.drop_index("ix_campaign_deliveries_delivery_token", "campaign_deliveries")
    op.drop_constraint("fk_campaign_deliveries_consent_receipt_id", "campaign_deliveries", type_="foreignkey")
    op.drop_constraint("fk_campaign_deliveries_capture_session_id", "campaign_deliveries", type_="foreignkey")
    op.drop_column("campaign_deliveries", "consent_receipt_id")
    op.drop_column("campaign_deliveries", "consent_decision")
    op.drop_column("campaign_deliveries", "capture_session_id")
    op.drop_column("campaign_deliveries", "delivery_token")
    op.drop_index("ix_notice_campaigns_property_id", "notice_campaigns")
    op.drop_constraint("fk_notice_campaigns_property_id", "notice_campaigns", type_="foreignkey")
    op.drop_column("notice_campaigns", "recipient_snapshot")
    op.drop_column("notice_campaigns", "property_id")
    op.drop_column("notice_campaigns", "recipient_source_config")
    op.drop_column("notice_campaigns", "recipient_source")
    op.drop_column("notice_campaigns", "campaign_purpose")
