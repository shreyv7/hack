"""Banking consent identifiers and cross-channel principal linkage."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260722_bank_consent_ids"
down_revision = "646399b5e1de"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "organization_settings",
        sa.Column("consent_industry_config", postgresql.JSON(astext_type=sa.Text()), nullable=True),
    )

    op.create_table(
        "consent_principals",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("canonical_ref", sa.String(length=255), nullable=False),
        sa.Column(
            "linkage_source",
            sa.Enum("bank_provided", "platform_derived", name="consent_linkage_source"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "canonical_ref", name="uq_consent_principal_org_ref"),
    )
    op.create_index("ix_consent_principals_organization_id", "consent_principals", ["organization_id"])

    op.create_table(
        "consent_principal_identifiers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("principal_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("identifier_type", sa.String(length=64), nullable=False),
        sa.Column("identifier_token", sa.String(length=512), nullable=False),
        sa.Column("token_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("last_seen_channel", sa.String(length=128), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["principal_id"], ["consent_principals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "principal_id",
            "identifier_type",
            "identifier_token",
            name="uq_principal_identifier_token",
        ),
    )
    op.create_index(
        "ix_consent_principal_identifiers_principal_id",
        "consent_principal_identifiers",
        ["principal_id"],
    )
    op.create_index(
        "ix_consent_principal_identifiers_identifier_type",
        "consent_principal_identifiers",
        ["identifier_type"],
    )
    op.create_index(
        "ix_consent_principal_identifiers_token_fingerprint",
        "consent_principal_identifiers",
        ["token_fingerprint"],
    )

    op.add_column("consent_receipts", sa.Column("capture_channel", sa.String(length=64), nullable=True))
    op.add_column("consent_receipts", sa.Column("journey_key", sa.String(length=64), nullable=True))
    op.add_column("consent_receipts", sa.Column("principal_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consent_receipts", sa.Column("bank_customer_ref", sa.String(length=512), nullable=True))
    op.add_column(
        "consent_receipts",
        sa.Column("identifier_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column("consent_receipts", sa.Column("notice_version_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("consent_receipts", sa.Column("proof_vault_record_id", postgresql.UUID(as_uuid=True), nullable=True))

    op.create_foreign_key(
        "fk_consent_receipts_principal_id",
        "consent_receipts",
        "consent_principals",
        ["principal_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_consent_receipts_notice_version_id",
        "consent_receipts",
        "consent_notice_versions",
        ["notice_version_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_consent_receipts_proof_vault_record_id",
        "consent_receipts",
        "proof_vault_records",
        ["proof_vault_record_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_consent_receipts_capture_channel", "consent_receipts", ["capture_channel"])
    op.create_index("ix_consent_receipts_journey_key", "consent_receipts", ["journey_key"])
    op.create_index("ix_consent_receipts_principal_id", "consent_receipts", ["principal_id"])
    op.create_index("ix_consent_receipts_bank_customer_ref", "consent_receipts", ["bank_customer_ref"])


def downgrade() -> None:
    op.drop_index("ix_consent_receipts_bank_customer_ref", table_name="consent_receipts")
    op.drop_index("ix_consent_receipts_principal_id", table_name="consent_receipts")
    op.drop_index("ix_consent_receipts_journey_key", table_name="consent_receipts")
    op.drop_index("ix_consent_receipts_capture_channel", table_name="consent_receipts")
    op.drop_constraint("fk_consent_receipts_proof_vault_record_id", "consent_receipts", type_="foreignkey")
    op.drop_constraint("fk_consent_receipts_notice_version_id", "consent_receipts", type_="foreignkey")
    op.drop_constraint("fk_consent_receipts_principal_id", "consent_receipts", type_="foreignkey")
    op.drop_column("consent_receipts", "proof_vault_record_id")
    op.drop_column("consent_receipts", "notice_version_id")
    op.drop_column("consent_receipts", "identifier_snapshot")
    op.drop_column("consent_receipts", "bank_customer_ref")
    op.drop_column("consent_receipts", "principal_id")
    op.drop_column("consent_receipts", "journey_key")
    op.drop_column("consent_receipts", "capture_channel")

    op.drop_index("ix_consent_principal_identifiers_token_fingerprint", table_name="consent_principal_identifiers")
    op.drop_index("ix_consent_principal_identifiers_identifier_type", table_name="consent_principal_identifiers")
    op.drop_index("ix_consent_principal_identifiers_principal_id", table_name="consent_principal_identifiers")
    op.drop_table("consent_principal_identifiers")
    op.drop_index("ix_consent_principals_organization_id", table_name="consent_principals")
    op.drop_table("consent_principals")
    op.execute("DROP TYPE IF EXISTS consent_linkage_source")
    op.drop_column("organization_settings", "consent_industry_config")
