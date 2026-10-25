"""workspace: organization_settings, data_processors, dpdp_obligations

Revision ID: 20260604_workspace
Revises: 20260603_signup
Create Date: 2026-06-04
"""

from typing import Sequence, Union
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260604_workspace"
down_revision: Union[str, None] = "20260603_signup"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

deployment_model = postgresql.ENUM(
    "public", "private", "hybrid", "on_prem", name="deployment_model", create_type=False
)
dpdp_role = postgresql.ENUM(
    "data_fiduciary",
    "data_processor",
    "significant_data_fiduciary",
    name="dpdp_role",
    create_type=False,
)
dpa_status = postgresql.ENUM("signed", "expired", "none", name="dpa_status", create_type=False)
role_requirement = postgresql.ENUM(
    "required",
    "recommended",
    "no",
    "mandatory",
    "mandatory-high-risk",
    name="role_requirement",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum("public", "private", "hybrid", "on_prem", name="deployment_model").create(
        bind, checkfirst=True
    )
    sa.Enum(
        "data_fiduciary",
        "data_processor",
        "significant_data_fiduciary",
        name="dpdp_role",
    ).create(bind, checkfirst=True)
    sa.Enum("signed", "expired", "none", name="dpa_status").create(bind, checkfirst=True)
    sa.Enum(
        "required",
        "recommended",
        "no",
        "mandatory",
        "mandatory-high-risk",
        name="role_requirement",
    ).create(bind, checkfirst=True)

    op.create_table(
        "organization_settings",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("registered_address", sa.Text(), nullable=True),
        sa.Column("headquarters", sa.String(length=512), nullable=True),
        sa.Column("india_presence", sa.Text(), nullable=True),
        sa.Column("solution_description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(length=2048), nullable=True),
        sa.Column("dpo_name", sa.String(length=255), nullable=True),
        sa.Column("dpo_email", sa.String(length=320), nullable=True),
        sa.Column("dpo_phone", sa.String(length=64), nullable=True),
        sa.Column("compliance_version", sa.String(length=128), nullable=True),
        sa.Column("changelog_summary", sa.Text(), nullable=True),
        sa.Column("self_attested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("third_party_audit_firm", sa.String(length=255), nullable=True),
        sa.Column("audit_valid_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("primary_industry", sa.String(length=128), nullable=True),
        sa.Column(
            "secondary_industries",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("is_significant_data_fiduciary", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("data_principals_count_band", sa.String(length=64), nullable=True),
        sa.Column("annual_turnover_band", sa.String(length=64), nullable=True),
        sa.Column(
            "deployment_model",
            deployment_model,
            server_default="public",
            nullable=False,
        ),
        sa.Column("primary_region", sa.String(length=128), nullable=True),
        sa.Column("backup_region", sa.String(length=128), nullable=True),
        sa.Column(
            "allowed_regions",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "data_residency",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "dpdp_role",
            dpdp_role,
            server_default="data_fiduciary",
            nullable=False,
        ),
        sa.Column("role_assessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("role_assessment", postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.create_index(
        op.f("ix_organization_settings_organization_id"),
        "organization_settings",
        ["organization_id"],
        unique=True,
    )

    op.create_table(
        "data_processors",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("processor_role", sa.String(length=128), server_default="Data Processor", nullable=False),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("dpa_status", dpa_status, server_default="none", nullable=False),
        sa.Column("dpa_signed_date", sa.Date(), nullable=True),
        sa.Column("risk_level", sa.String(length=32), nullable=True),
        sa.Column("data_categories", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=255), nullable=True),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_data_processors_organization_id"),
        "data_processors",
        ["organization_id"],
        unique=False,
    )

    op.create_table(
        "dpdp_obligation_definitions",
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("obligation", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("statute_reference", sa.String(length=128), nullable=False),
        sa.Column("df_requirement", role_requirement, nullable=False),
        sa.Column("dp_requirement", role_requirement, nullable=False),
        sa.Column("sdf_requirement", role_requirement, nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Backfill settings for existing organizations
    default_residency = (
        '[{"category": "Consent records", "region": "Mumbai", "cross_border": false, '
        '"legal_basis": "", "details": ""}, '
        '{"category": "PII detected", "region": "Mumbai", "cross_border": false, '
        '"legal_basis": "", "details": ""}, '
        '{"category": "Audit logs", "region": "Mumbai + Hyderabad", "cross_border": false, '
        '"legal_basis": "", "details": ""}, '
        '{"category": "Aggregated analytics", "region": "Global", "cross_border": true, '
        '"legal_basis": "Anonymized only", "details": ""}]'
    )
    op.execute(
        f"""
        INSERT INTO organization_settings (
            id, organization_id, secondary_industries, deployment_model,
            primary_region, backup_region, allowed_regions, data_residency,
            dpdp_role, is_significant_data_fiduciary
        )
        SELECT
            gen_random_uuid(),
            o.id,
            '[]'::json,
            'public',
            'Mumbai (ap-south-1)',
            'Hyderabad (ap-south-2)',
            '["Mumbai", "Hyderabad", "Singapore", "Frankfurt"]'::json,
            '{default_residency}'::json,
            'data_fiduciary',
            false
        FROM organizations o
        WHERE NOT EXISTS (
            SELECT 1 FROM organization_settings s WHERE s.organization_id = o.id
        )
        """
    )

    from app.scripts.seed_dpdp_obligations import OBLIGATION_ROWS

    obligations = sa.table(
        "dpdp_obligation_definitions",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("sort_order", sa.Integer),
        sa.column("obligation", sa.String),
        sa.column("description", sa.Text),
        sa.column("statute_reference", sa.String),
        sa.column("df_requirement", sa.String),
        sa.column("dp_requirement", sa.String),
        sa.column("sdf_requirement", sa.String),
    )
    existing = bind.execute(sa.text("SELECT COUNT(*) FROM dpdp_obligation_definitions")).scalar()
    if existing == 0:
        op.bulk_insert(
            obligations,
            [
                {
                    "id": uuid.uuid4(),
                    "sort_order": row["sort_order"],
                    "obligation": row["obligation"],
                    "description": row["description"],
                    "statute_reference": row["statute_reference"],
                    "df_requirement": row["df"],
                    "dp_requirement": row["dp"],
                    "sdf_requirement": row["sdf"],
                }
                for row in OBLIGATION_ROWS
            ],
        )


def downgrade() -> None:
    op.drop_table("dpdp_obligation_definitions")
    op.drop_index(op.f("ix_data_processors_organization_id"), table_name="data_processors")
    op.drop_table("data_processors")
    op.drop_index(
        op.f("ix_organization_settings_organization_id"),
        table_name="organization_settings",
    )
    op.drop_table("organization_settings")
    bind = op.get_bind()
    sa.Enum(name="role_requirement").drop(bind, checkfirst=True)
    sa.Enum(name="dpa_status").drop(bind, checkfirst=True)
    sa.Enum(name="dpdp_role").drop(bind, checkfirst=True)
    sa.Enum(name="deployment_model").drop(bind, checkfirst=True)
