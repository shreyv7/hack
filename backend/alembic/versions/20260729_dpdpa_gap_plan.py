"""DPDPA gap plan: compliance modules, refresh tokens, webhook secrets.

Revision ID: 20260729_dpdpa_gap
Revises: 20260803_data_source_governance
Create Date: 2026-07-29
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260729_dpdpa_gap"
down_revision: Union[str, None] = "20260807_masking_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_token_sessions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_jti", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("ip_hash", sa.String(length=64), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_jti"),
    )
    op.create_index("ix_refresh_token_sessions_user_id", "refresh_token_sessions", ["user_id"])
    op.create_index("ix_refresh_token_sessions_token_jti", "refresh_token_sessions", ["token_jti"])

    op.create_table(
        "legitimate_use_records",
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column(
            "ground_type",
            sa.Enum(
                "employment",
                "medical_emergency",
                "disaster_response",
                "legal_claim",
                "research_statistics",
                "fraud_default",
                "judicial_regulatory",
                "startup_notification",
                "other",
                name="legitimate_use_ground",
            ),
            nullable=False,
        ),
        sa.Column("legal_rationale", sa.Text(), nullable=False),
        sa.Column("approver_name", sa.String(length=255), nullable=True),
        sa.Column("approver_user_id", sa.UUID(), nullable=True),
        sa.Column("retention_basis", sa.Text(), nullable=True),
        sa.Column("downstream_sharing", sa.Text(), nullable=True),
        sa.Column("review_date", sa.Date(), nullable=True),
        sa.Column("exemption_tags", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("evidence_refs", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column(
            "status",
            sa.Enum("active", "under_review", "retired", name="legitimate_use_status"),
            nullable=False,
        ),
        sa.Column("ropa_activity_id", sa.UUID(), nullable=True),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["approver_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ropa_activity_id"], ["processing_activities.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_legitimate_use_records_organization_id", "legitimate_use_records", ["organization_id"])

    op.create_table(
        "legacy_consent_campaigns",
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("notice_version_id", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("draft", "active", "completed", "cancelled", name="legacy_campaign_status"),
            nullable=False,
        ),
        sa.Column("audience_filter", postgresql.JSON(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("delivery_channels", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("reminder_schedule", postgresql.JSON(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stats", postgresql.JSON(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["notice_version_id"], ["consent_notice_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_legacy_consent_campaigns_organization_id", "legacy_consent_campaigns", ["organization_id"])

    op.create_table(
        "legacy_consent_campaign_recipients",
        sa.Column("campaign_id", sa.UUID(), nullable=False),
        sa.Column("principal_email", sa.String(length=320), nullable=True),
        sa.Column("principal_phone", sa.String(length=32), nullable=True),
        sa.Column("consent_receipt_id", sa.UUID(), nullable=True),
        sa.Column("delivery_status", sa.String(length=64), nullable=False),
        sa.Column("last_reminder_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminder_count", sa.Integer(), nullable=False),
        sa.Column(
            "outcome",
            sa.Enum(
                "pending",
                "delivered",
                "reconsented",
                "withdrawn",
                "no_response",
                name="legacy_recipient_outcome",
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["campaign_id"], ["legacy_consent_campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["consent_receipt_id"], ["consent_receipts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_legacy_consent_campaign_recipients_campaign_id",
        "legacy_consent_campaign_recipients",
        ["campaign_id"],
    )

    op.create_table(
        "regulatory_proceedings",
        sa.Column("organization_id", sa.UUID(), nullable=False),
        sa.Column("proceeding_ref", sa.String(length=64), nullable=False),
        sa.Column(
            "proceeding_type",
            sa.Enum(
                "board_notice",
                "inquiry",
                "voluntary_undertaking",
                "appeal",
                "penalty",
                "correspondence",
                name="regulatory_proceeding_type",
            ),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.Enum("open", "in_progress", "submitted", "closed", "appealed", name="regulatory_proceeding_status"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=512), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("board_reference", sa.String(length=255), nullable=True),
        sa.Column("penalty_exposure_crores", sa.Integer(), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("assigned_to_user_id", sa.UUID(), nullable=True),
        sa.Column("evidence_pack", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("correspondence_log", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("linked_breach_id", sa.UUID(), nullable=True),
        sa.Column("linked_audit_refs", postgresql.JSON(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["linked_breach_id"], ["breach_incidents.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_regulatory_proceedings_organization_id", "regulatory_proceedings", ["organization_id"])
    op.create_index("ix_regulatory_proceedings_proceeding_ref", "regulatory_proceedings", ["proceeding_ref"])

    op.add_column("consent_manager_connections", sa.Column("webhook_secret", sa.String(length=128), nullable=True))
    op.add_column(
        "consent_manager_connections",
        sa.Column("last_webhook_event_id", sa.String(length=128), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_manager_connections", "last_webhook_event_id")
    op.drop_column("consent_manager_connections", "webhook_secret")
    op.drop_table("regulatory_proceedings")
    op.drop_table("legacy_consent_campaign_recipients")
    op.drop_table("legacy_consent_campaigns")
    op.drop_table("legitimate_use_records")
    op.drop_table("refresh_token_sessions")
    sa.Enum(name="regulatory_proceeding_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="regulatory_proceeding_type").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="legacy_recipient_outcome").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="legacy_campaign_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="legitimate_use_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="legitimate_use_ground").drop(op.get_bind(), checkfirst=True)
