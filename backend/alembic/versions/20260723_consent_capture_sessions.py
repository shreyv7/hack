"""Assisted consent capture sessions with OTP verification."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260723_cap_sessions"
down_revision = "20260722_bank_consent_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "consent_receipts",
        sa.Column("assisted_capture_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "consent_capture_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("client_session_id", sa.String(length=128), nullable=False),
        sa.Column("journey_key", sa.String(length=64), nullable=False),
        sa.Column("capture_channel", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "draft",
                "otp_pending",
                "verified",
                "completed",
                "expired",
                "failed",
                name="consent_capture_session_status",
            ),
            nullable=False,
        ),
        sa.Column(
            "capture_mode",
            sa.Enum("online", "offline", name="consent_capture_mode"),
            nullable=False,
        ),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("staff_metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("mobile_e164", sa.String(length=32), nullable=True),
        sa.Column("otp_code_hash", sa.String(length=128), nullable=True),
        sa.Column("otp_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("otp_sent_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_otp_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_receipt_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("client_captured_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("otp_verified_token", sa.String(length=512), nullable=True),
        sa.ForeignKeyConstraint(["consent_receipt_id"], ["consent_receipts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_id"], ["integration_properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "property_id",
            "client_session_id",
            name="uq_consent_capture_session_property_client",
        ),
    )
    op.create_index(
        "ix_consent_capture_sessions_organization_id",
        "consent_capture_sessions",
        ["organization_id"],
    )
    op.create_index(
        "ix_consent_capture_sessions_property_id",
        "consent_capture_sessions",
        ["property_id"],
    )
    op.create_index(
        "ix_consent_capture_sessions_client_session_id",
        "consent_capture_sessions",
        ["client_session_id"],
    )
    op.create_index(
        "ix_consent_capture_sessions_consent_receipt_id",
        "consent_capture_sessions",
        ["consent_receipt_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_consent_capture_sessions_consent_receipt_id", table_name="consent_capture_sessions")
    op.drop_index("ix_consent_capture_sessions_client_session_id", table_name="consent_capture_sessions")
    op.drop_index("ix_consent_capture_sessions_property_id", table_name="consent_capture_sessions")
    op.drop_index("ix_consent_capture_sessions_organization_id", table_name="consent_capture_sessions")
    op.drop_table("consent_capture_sessions")
    op.execute("DROP TYPE IF EXISTS consent_capture_session_status")
    op.execute("DROP TYPE IF EXISTS consent_capture_mode")
    op.drop_column("consent_receipts", "assisted_capture_metadata")
