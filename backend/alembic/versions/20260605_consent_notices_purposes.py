"""consent: purposes, consent_notices, versions, notice_version_purposes

Revision ID: 20260605_consent
Revises: 20260604_workspace
Create Date: 2026-06-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260605_consent"
down_revision: Union[str, None] = "20260604_workspace"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

legal_basis = postgresql.ENUM("consent", "legitimate_use", name="legal_basis", create_type=False)
notice_version_status = postgresql.ENUM(
    "draft", "live", "archived", name="notice_version_status", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()
    sa.Enum("consent", "legitimate_use", name="legal_basis").create(bind, checkfirst=True)
    sa.Enum("draft", "live", "archived", name="notice_version_status").create(bind, checkfirst=True)

    op.create_table(
        "purposes",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("legal_basis", legal_basis, server_default="consent", nullable=False),
        sa.Column(
            "data_categories",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("retention_period", sa.String(length=255), server_default="", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_special_category", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_purposes_organization_id", "purposes", ["organization_id"])

    op.create_table(
        "consent_notices",
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("internal_name", sa.String(length=255), nullable=False),
        sa.Column("current_live_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
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
    op.create_index("ix_consent_notices_organization_id", "consent_notices", ["organization_id"])

    op.create_table(
        "consent_notice_versions",
        sa.Column("notice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("status", notice_version_status, server_default="draft", nullable=False),
        sa.Column("display_name", sa.String(length=255), server_default="", nullable=False),
        sa.Column("language", sa.String(length=64), server_default="English", nullable=False),
        sa.Column("opening_statement", sa.Text(), server_default="", nullable=False),
        sa.Column("contact_email", sa.String(length=320), nullable=True),
        sa.Column("contact_website", sa.String(length=2048), nullable=True),
        sa.Column("dpo_name", sa.String(length=255), nullable=True),
        sa.Column("dpo_email", sa.String(length=320), nullable=True),
        sa.Column("rights_exercise", sa.Text(), server_default="", nullable=False),
        sa.Column("complaint_process", sa.Text(), server_default="", nullable=False),
        sa.Column("retention_policy", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "compliance_warnings",
            postgresql.JSON(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.ForeignKeyConstraint(["notice_id"], ["consent_notices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["published_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("notice_id", "version_number", name="uq_notice_version_number"),
    )
    op.create_index(
        "ix_consent_notice_versions_notice_id", "consent_notice_versions", ["notice_id"]
    )

    op.create_foreign_key(
        "fk_consent_notices_current_live_version_id",
        "consent_notices",
        "consent_notice_versions",
        ["current_live_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "notice_version_purposes",
        sa.Column("notice_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("purpose_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["notice_version_id"], ["consent_notice_versions.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["purpose_id"], ["purposes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("notice_version_id", "purpose_id"),
    )


def downgrade() -> None:
    op.drop_table("notice_version_purposes")
    op.drop_constraint(
        "fk_consent_notices_current_live_version_id", "consent_notices", type_="foreignkey"
    )
    op.drop_index("ix_consent_notice_versions_notice_id", table_name="consent_notice_versions")
    op.drop_table("consent_notice_versions")
    op.drop_index("ix_consent_notices_organization_id", table_name="consent_notices")
    op.drop_table("consent_notices")
    op.drop_index("ix_purposes_organization_id", table_name="purposes")
    op.drop_table("purposes")

    bind = op.get_bind()
    sa.Enum(name="notice_version_status").drop(bind, checkfirst=True)
    sa.Enum(name="legal_basis").drop(bind, checkfirst=True)
