"""anonymisation job governance fields + proof vault link

Revision ID: 20260729_anon_governance
Revises: 20260807_masking_runs
Create Date: 2026-07-29 00:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260729_anon_governance"
down_revision: Union[str, Sequence[str], None] = "20260807_masking_runs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("anonymisation_jobs", sa.Column("business_purpose", sa.Text(), nullable=True))
    op.add_column(
        "anonymisation_jobs",
        sa.Column("requested_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("anonymisation_jobs", sa.Column("requested_by_email", sa.String(length=320), nullable=True))
    op.add_column("anonymisation_jobs", sa.Column("output_recipient", sa.String(length=512), nullable=True))
    op.add_column(
        "anonymisation_jobs",
        sa.Column("external_sharing", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "anonymisation_jobs",
        sa.Column("cross_border_expected", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "anonymisation_jobs",
        sa.Column("proof_vault_record_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_anon_jobs_requested_by_user",
        "anonymisation_jobs",
        "users",
        ["requested_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_anon_jobs_proof_vault",
        "anonymisation_jobs",
        "proof_vault_records",
        ["proof_vault_record_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_anon_jobs_proof_vault", "anonymisation_jobs", type_="foreignkey")
    op.drop_constraint("fk_anon_jobs_requested_by_user", "anonymisation_jobs", type_="foreignkey")
    op.drop_column("anonymisation_jobs", "proof_vault_record_id")
    op.drop_column("anonymisation_jobs", "cross_border_expected")
    op.drop_column("anonymisation_jobs", "external_sharing")
    op.drop_column("anonymisation_jobs", "output_recipient")
    op.drop_column("anonymisation_jobs", "requested_by_email")
    op.drop_column("anonymisation_jobs", "requested_by_user_id")
    op.drop_column("anonymisation_jobs", "business_purpose")
