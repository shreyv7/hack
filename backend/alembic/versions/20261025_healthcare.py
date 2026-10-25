"""Healthcare records, purpose consents and audited emergency overrides.

Revision ID: 20261025_healthcare
Revises: 20260731_merge_email_campaign
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20261025_healthcare"
down_revision = "20260731_merge_email_campaign"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("healthcare_patients",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("mrn", sa.String(64), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("date_of_birth", sa.Date(), nullable=False),
        sa.Column("gender", sa.String(32), nullable=False),
        sa.Column("phone_hash", sa.String(64)),
        sa.Column("consent_principal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("consent_principals.id"), nullable=False),
        sa.UniqueConstraint("organization_id", "mrn", name="uq_healthcare_patient_org_mrn"))
    op.create_index("ix_healthcare_patients_organization_id", "healthcare_patients", ["organization_id"])
    op.create_table("ehr_clinical_records",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("patient_id", sa.String(64), sa.ForeignKey("healthcare_patients.id"), nullable=False),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("sensitivity_level", sa.String(32), nullable=False),
        sa.Column("clinical_data", postgresql.JSONB(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_ehr_clinical_records_patient_id", "ehr_clinical_records", ["patient_id"])
    op.create_table("healthcare_consents",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("patient_id", sa.String(64), sa.ForeignKey("healthcare_patients.id"), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("allowed_categories", postgresql.JSONB(), nullable=False),
        sa.Column("denied_categories", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("proof_record_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("proof_vault_records.id"), nullable=False))
    op.create_index("ix_healthcare_consents_patient_id", "healthcare_consents", ["patient_id"])
    op.create_index("ix_healthcare_consents_purpose", "healthcare_consents", ["purpose"])
    op.create_table("access_decision_audits",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("patient_id", sa.String(64), sa.ForeignKey("healthcare_patients.id"), nullable=False),
        sa.Column("purpose", sa.String(32), nullable=False),
        sa.Column("department", sa.String(128), nullable=False),
        sa.Column("allowed_categories", postgresql.JSONB(), nullable=False),
        sa.Column("redacted_categories", postgresql.JSONB(), nullable=False),
        sa.Column("emergency_override", sa.Boolean(), nullable=False),
        sa.Column("proof_hash", sa.String(64), nullable=False),
        sa.Column("decision_timestamp", sa.DateTime(timezone=True), nullable=False))
    op.create_index("ix_access_decision_audits_organization_id", "access_decision_audits", ["organization_id"])
    op.create_index("ix_access_decision_audits_patient_id", "access_decision_audits", ["patient_id"])
    op.create_table("emergency_override_logs",
        sa.Column("id", sa.String(64), primary_key=True),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("clinician_id", sa.String(64), nullable=False),
        sa.Column("patient_id", sa.String(64), sa.ForeignKey("healthcare_patients.id"), nullable=False),
        sa.Column("department", sa.String(128), nullable=False),
        sa.Column("emergency_reason", sa.Text(), nullable=False),
        sa.Column("proof_hash", sa.String(64), nullable=False),
        sa.Column("triggered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dpo_reviewed", sa.Boolean(), nullable=False),
        sa.Column("reviewed_by", sa.String(64)),
        sa.Column("reviewed_at", sa.DateTime(timezone=True)))
    op.create_index("ix_emergency_override_logs_organization_id", "emergency_override_logs", ["organization_id"])
    op.create_index("ix_emergency_override_logs_patient_id", "emergency_override_logs", ["patient_id"])


def downgrade():
    for name in ("emergency_override_logs", "access_decision_audits", "healthcare_consents", "ehr_clinical_records", "healthcare_patients"):
        op.drop_table(name)
