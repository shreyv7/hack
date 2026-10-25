"""Phase 1 — consent enforcement tables and property signing secret."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260731_enforce_p1"
down_revision = "20260730_req9_reporting"
branch_labels = None
depends_on = None


def upgrade() -> None:
    enforcement_mode = postgresql.ENUM(
        "disabled", "shadow", "enforced", name="enforcement_mode", create_type=False
    )
    deny_behavior = postgresql.ENUM(
        "reject", "strip_fields", "queue_pending", name="enforcement_deny_behavior", create_type=False
    )
    property_enforcement_mode = postgresql.ENUM(
        "disabled", "shadow", "enforced", name="property_enforcement_mode", create_type=False
    )

    op.execute("CREATE TYPE enforcement_mode AS ENUM ('disabled', 'shadow', 'enforced')")
    op.execute(
        "CREATE TYPE enforcement_deny_behavior AS ENUM ('reject', 'strip_fields', 'queue_pending')"
    )
    op.execute(
        "CREATE TYPE property_enforcement_mode AS ENUM ('disabled', 'shadow', 'enforced')"
    )

    op.add_column(
        "integration_properties",
        sa.Column("decision_signing_secret_encrypted", sa.String(512), nullable=True),
    )
    op.add_column(
        "integration_properties",
        sa.Column(
            "enforcement_mode",
            property_enforcement_mode,
            nullable=False,
            server_default="disabled",
        ),
    )

    op.create_table(
        "purpose_enforcement_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purposes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mode", enforcement_mode, nullable=False, server_default="disabled"),
        sa.Column("deny_behavior", deny_behavior, nullable=False, server_default="reject"),
        sa.Column("updated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "purpose_id", name="uq_purpose_enforcement_org_purpose"),
    )
    op.create_index("ix_purpose_enforcement_configs_org", "purpose_enforcement_configs", ["organization_id"])
    op.create_index("ix_purpose_enforcement_configs_purpose", "purpose_enforcement_configs", ["purpose_id"])

    # Partitioned decision log — monthly ranges from day one.
    op.execute(
        """
        CREATE TABLE enforcement_events (
            id UUID NOT NULL DEFAULT gen_random_uuid(),
            organization_id UUID NOT NULL,
            property_id UUID,
            purpose_id UUID,
            principal_fingerprint VARCHAR(64) NOT NULL,
            decision VARCHAR(32) NOT NULL,
            legal_basis VARCHAR(32) NOT NULL,
            effective_mode VARCHAR(16) NOT NULL,
            receipt_id UUID,
            collection_point VARCHAR(255),
            latency_ms INTEGER,
            occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (id, occurred_at)
        ) PARTITION BY RANGE (occurred_at)
        """
    )
    op.execute(
        """
        CREATE TABLE enforcement_events_2026_07 PARTITION OF enforcement_events
            FOR VALUES FROM ('2026-07-01') TO ('2026-08-01')
        """
    )
    op.execute(
        """
        CREATE TABLE enforcement_events_2026_08 PARTITION OF enforcement_events
            FOR VALUES FROM ('2026-08-01') TO ('2026-09-01')
        """
    )
    op.execute(
        """
        CREATE TABLE enforcement_events_2026_09 PARTITION OF enforcement_events
            FOR VALUES FROM ('2026-09-01') TO ('2026-10-01')
        """
    )
    op.execute("CREATE INDEX ix_enforcement_events_org_occurred ON enforcement_events (organization_id, occurred_at DESC)")
    op.execute("CREATE INDEX ix_enforcement_events_property_occurred ON enforcement_events (property_id, occurred_at DESC)")
    op.execute("CREATE INDEX ix_enforcement_events_principal ON enforcement_events (principal_fingerprint, occurred_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS enforcement_events CASCADE")
    op.drop_index("ix_purpose_enforcement_configs_purpose", table_name="purpose_enforcement_configs")
    op.drop_index("ix_purpose_enforcement_configs_org", table_name="purpose_enforcement_configs")
    op.drop_table("purpose_enforcement_configs")
    op.drop_column("integration_properties", "enforcement_mode")
    op.drop_column("integration_properties", "decision_signing_secret_encrypted")
    op.execute("DROP TYPE IF EXISTS property_enforcement_mode")
    op.execute("DROP TYPE IF EXISTS enforcement_deny_behavior")
    op.execute("DROP TYPE IF EXISTS enforcement_mode")
