"""Proof Vault v2 — DPDPA-compliant enriched proof payloads."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260724_proof_vault_v2"
down_revision = "20260723_branch_op"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "proof_vault_records",
        sa.Column("payload_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("proof_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("proof_payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("notice_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("language", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("journey_key", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("customer_ref_fingerprint", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("identifier_types", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "proof_vault_records",
        sa.Column("receipt_signature", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_proof_vault_records_customer_ref_fingerprint",
        "proof_vault_records",
        ["customer_ref_fingerprint"],
    )
    op.create_index(
        "ix_proof_vault_records_notice_version_id",
        "proof_vault_records",
        ["notice_version_id"],
    )

    op.add_column(
        "consent_receipts",
        sa.Column("proof_seal_status", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_receipts", "proof_seal_status")
    op.drop_index("ix_proof_vault_records_notice_version_id", table_name="proof_vault_records")
    op.drop_index("ix_proof_vault_records_customer_ref_fingerprint", table_name="proof_vault_records")
    op.drop_column("proof_vault_records", "receipt_signature")
    op.drop_column("proof_vault_records", "identifier_types")
    op.drop_column("proof_vault_records", "customer_ref_fingerprint")
    op.drop_column("proof_vault_records", "journey_key")
    op.drop_column("proof_vault_records", "language")
    op.drop_column("proof_vault_records", "notice_version_id")
    op.drop_column("proof_vault_records", "proof_payload_json")
    op.drop_column("proof_vault_records", "proof_hash")
    op.drop_column("proof_vault_records", "payload_version")
