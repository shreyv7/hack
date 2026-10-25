"""Add consent_webhook_url to consent_banners."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260630_consent_webhook_url"
down_revision: Union[str, None] = "20260630_developer_mode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "consent_banners",
        sa.Column("consent_webhook_url", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("consent_banners", "consent_webhook_url")
