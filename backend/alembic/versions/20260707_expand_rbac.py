"""expand user roles, breach workflow fields, dsar legal signoff, steward scopes

Revision ID: 20260707_expand_rbac
Revises: 20260706_anon_dl_log
Create Date: 2026-07-07
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260707_expand_rbac"
down_revision: Union[str, None] = "20260706_anon_dl_log"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NEW_ROLES = (
    "ciso",
    "legal_head",
    "legal_counsel",
    "compliance_officer",
    "grievance_officer",
    "security_analyst",
    "data_steward",
    "auditor",
)


def upgrade() -> None:
    bind = op.get_bind()
    for role in NEW_ROLES:
        op.execute(sa.text(f"ALTER TYPE user_role ADD VALUE IF NOT EXISTS '{role}'"))

    op.create_table(
        "user_scope_assignments",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("business_unit_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True), nullable=True),
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
        sa.ForeignKeyConstraint(["business_unit_id"], ["business_units.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["department_id"], ["departments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "organization_id",
            "business_unit_id",
            "department_id",
            name="uq_user_scope_assignment",
        ),
    )
    op.create_index(
        op.f("ix_user_scope_assignments_user_id"),
        "user_scope_assignments",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_user_scope_assignments_organization_id"),
        "user_scope_assignments",
        ["organization_id"],
        unique=False,
    )

    op.add_column(
        "breach_incidents",
        sa.Column("assigned_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "breach_incidents",
        sa.Column("escalated_to_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "breach_incidents",
        sa.Column("escalated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_breach_incidents_assigned_to_user_id",
        "breach_incidents",
        "users",
        ["assigned_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_breach_incidents_escalated_to_user_id",
        "breach_incidents",
        "users",
        ["escalated_to_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        op.f("ix_breach_incidents_assigned_to_user_id"),
        "breach_incidents",
        ["assigned_to_user_id"],
        unique=False,
    )

    op.add_column(
        "data_rights_requests",
        sa.Column("requires_legal_signoff", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "data_rights_requests",
        sa.Column("legal_signed_off_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_data_rights_requests_legal_signed_off_by_user_id",
        "data_rights_requests",
        "users",
        ["legal_signed_off_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_data_rights_requests_legal_signed_off_by_user_id",
        "data_rights_requests",
        type_="foreignkey",
    )
    op.drop_column("data_rights_requests", "legal_signed_off_by_user_id")
    op.drop_column("data_rights_requests", "requires_legal_signoff")

    op.drop_index(op.f("ix_breach_incidents_assigned_to_user_id"), table_name="breach_incidents")
    op.drop_constraint(
        "fk_breach_incidents_escalated_to_user_id", "breach_incidents", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_breach_incidents_assigned_to_user_id", "breach_incidents", type_="foreignkey"
    )
    op.drop_column("breach_incidents", "escalated_at")
    op.drop_column("breach_incidents", "escalated_to_user_id")
    op.drop_column("breach_incidents", "assigned_to_user_id")

    op.drop_index(
        op.f("ix_user_scope_assignments_organization_id"), table_name="user_scope_assignments"
    )
    op.drop_index(op.f("ix_user_scope_assignments_user_id"), table_name="user_scope_assignments")
    op.drop_table("user_scope_assignments")
    # PostgreSQL enum values cannot be removed safely; leave expanded user_role as-is.
