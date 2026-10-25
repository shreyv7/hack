"""Merge dpdpa gap and anon governance heads

Revision ID: 20260729_merge_heads
Revises: 20260729_anon_governance, 20260729_dpdpa_gap
Create Date: 2026-07-29
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260729_merge_heads"
down_revision: Union[str, Sequence[str], None] = ("20260729_anon_governance", "20260729_dpdpa_gap")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
