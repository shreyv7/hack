"""Req 3 — notice approval workflow, banner withdraw CTA, A/B start, default language."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260728_req3_banners"
down_revision = "20260727_webhooks_req7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for value in ("pending_legal", "pending_dpo", "dpo_approved"):
        op.execute(
            f"ALTER TYPE notice_version_status ADD VALUE IF NOT EXISTS '{value}'"
        )

    op.add_column(
        "consent_notice_versions",
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "consent_notice_versions",
        sa.Column("legal_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "consent_notice_versions",
        sa.Column(
            "legal_reviewed_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "consent_notice_versions",
        sa.Column("dpo_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "consent_notice_versions",
        sa.Column(
            "dpo_approved_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "consent_notice_versions",
        sa.Column("approval_notes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.add_column(
        "consent_banners",
        sa.Column("cta_withdraw", sa.String(100), nullable=True),
    )
    op.add_column(
        "consent_banners",
        sa.Column("show_withdraw_action", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "consent_banners",
        sa.Column("ab_test_started_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.add_column(
        "organization_settings",
        sa.Column("default_consent_language", sa.String(16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("organization_settings", "default_consent_language")
    op.drop_column("consent_banners", "ab_test_started_at")
    op.drop_column("consent_banners", "show_withdraw_action")
    op.drop_column("consent_banners", "cta_withdraw")
    op.drop_column("consent_notice_versions", "approval_notes")
    op.drop_column("consent_notice_versions", "dpo_approved_by_user_id")
    op.drop_column("consent_notice_versions", "dpo_approved_at")
    op.drop_column("consent_notice_versions", "legal_reviewed_by_user_id")
    op.drop_column("consent_notice_versions", "legal_reviewed_at")
    op.drop_column("consent_notice_versions", "submitted_at")
