"""Add business_unit_id FKs for cross-module BU scoping."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260629_bu_scope"
down_revision: Union[str, None] = "20260629_governance_dashboards"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = (
    "data_rights_requests",
    "breach_incidents",
    "dpias",
    "policy_documents",
    "data_processors",
    "proof_vault_records",
)


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table,
            sa.Column(
                "business_unit_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("business_units.id", ondelete="SET NULL"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table}_business_unit_id", table, ["business_unit_id"])


def downgrade() -> None:
    for table in reversed(_TABLES):
        op.drop_index(f"ix_{table}_business_unit_id", table_name=table)
        op.drop_column(table, "business_unit_id")
