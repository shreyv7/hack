"""Add principal_phone and portal_sms fields to consent_receipts."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260703_consent_portal_sms"
down_revision: Union[str, None] = "0d015ef4002d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consent_receipts",
        sa.Column("principal_phone", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "consent_receipts",
        sa.Column("portal_sms_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "consent_receipts",
        sa.Column("portal_sms_status", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_receipts", "portal_sms_status")
    op.drop_column("consent_receipts", "portal_sms_sent_at")
    op.drop_column("consent_receipts", "principal_phone")
