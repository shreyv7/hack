"""Merge email consent campaign branch into mainline head.

Revision ID: 20260731_merge_email_campaign
Revises: 20260729_notif_meta, 20260731_email_campaign
Create Date: 2026-07-31
"""

from typing import Sequence, Union

revision: str = "20260731_merge_email_campaign"
down_revision: Union[str, Sequence[str], None] = (
    "20260729_notif_meta",
    "20260731_email_campaign",
)
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
