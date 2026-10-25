"""Req 7 — webhook signing, subscriptions, expiry tracking."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260727_webhooks_req7"
down_revision = "20260726_retention_req6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "consent_banners",
        sa.Column("webhook_signing_secret", sa.String(128), nullable=True),
    )
    op.add_column(
        "consent_banners",
        sa.Column(
            "webhook_subscribed_events",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.add_column(
        "consent_banners",
        sa.Column("webhook_bearer_token", sa.String(512), nullable=True),
    )
    op.add_column(
        "consent_receipts",
        sa.Column("expiry_webhook_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_receipts", "expiry_webhook_sent_at")
    op.drop_column("consent_banners", "webhook_bearer_token")
    op.drop_column("consent_banners", "webhook_subscribed_events")
    op.drop_column("consent_banners", "webhook_signing_secret")
