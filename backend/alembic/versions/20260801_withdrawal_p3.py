"""Phase 3 — purpose data mappings and withdrawal remediation."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260801_withdraw_p3"
down_revision = "20260731_enforce_p1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    withdrawal_action = postgresql.ENUM(
        "mask",
        "anonymize",
        "delete",
        "pseudonymize",
        "flag_manual_review",
        name="withdrawal_action",
        create_type=False,
    )
    remediation_status = postgresql.ENUM(
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        name="remediation_task_status",
        create_type=False,
    )

    op.execute(
        "CREATE TYPE withdrawal_action AS ENUM "
        "('mask', 'anonymize', 'delete', 'pseudonymize', 'flag_manual_review')"
    )
    op.execute(
        "CREATE TYPE remediation_task_status AS ENUM "
        "('pending', 'in_progress', 'completed', 'cancelled')"
    )

    op.create_table(
        "purpose_data_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purposes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inventory_field_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("data_inventory_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("withdrawal_action", withdrawal_action, nullable=False, server_default="mask"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("organization_id", "purpose_id", "inventory_field_id", name="uq_purpose_data_mapping_org_purpose_field"),
    )
    op.create_index("ix_purpose_data_mappings_org", "purpose_data_mappings", ["organization_id"])
    op.create_index("ix_purpose_data_mappings_purpose", "purpose_data_mappings", ["purpose_id"])

    op.create_table(
        "withdrawal_remediation_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("purpose_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purposes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("inventory_field_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("data_inventory_fields.id", ondelete="CASCADE"), nullable=False),
        sa.Column("principal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("consent_principals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("integration_properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("receipt_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("consent_receipts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mapping_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purpose_data_mappings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", withdrawal_action, nullable=False),
        sa.Column("status", remediation_status, nullable=False, server_default="pending"),
        sa.Column("sla_due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("proof_vault_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("proof_vault_records.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_withdrawal_remediation_tasks_org", "withdrawal_remediation_tasks", ["organization_id"])
    op.create_index("ix_withdrawal_remediation_tasks_status", "withdrawal_remediation_tasks", ["status"])
    op.create_index("ix_withdrawal_remediation_tasks_sla", "withdrawal_remediation_tasks", ["sla_due_at"])

    op.add_column(
        "retention_policies",
        sa.Column("source_purpose_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("purposes.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_retention_policies_source_purpose", "retention_policies", ["source_purpose_id"])


def downgrade() -> None:
    op.drop_index("ix_retention_policies_source_purpose", table_name="retention_policies")
    op.drop_column("retention_policies", "source_purpose_id")
    op.drop_index("ix_withdrawal_remediation_tasks_sla", table_name="withdrawal_remediation_tasks")
    op.drop_index("ix_withdrawal_remediation_tasks_status", table_name="withdrawal_remediation_tasks")
    op.drop_index("ix_withdrawal_remediation_tasks_org", table_name="withdrawal_remediation_tasks")
    op.drop_table("withdrawal_remediation_tasks")
    op.drop_index("ix_purpose_data_mappings_purpose", table_name="purpose_data_mappings")
    op.drop_index("ix_purpose_data_mappings_org", table_name="purpose_data_mappings")
    op.drop_table("purpose_data_mappings")
    op.execute("DROP TYPE IF EXISTS remediation_task_status")
    op.execute("DROP TYPE IF EXISTS withdrawal_action")
