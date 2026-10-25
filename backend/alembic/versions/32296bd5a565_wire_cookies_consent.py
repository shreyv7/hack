"""wire_cookies_consent

Revision ID: 32296bd5a565
Revises: 4951843b7ec9
Create Date: 2026-06-05 22:52:27.846479

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '32296bd5a565'
down_revision: Union[str, None] = '4951843b7ec9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add consent_notice_id to integration_properties
    op.add_column(
        'integration_properties',
        sa.Column('consent_notice_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('consent_notices.id', ondelete='SET NULL'), nullable=True)
    )
    
    # Add purpose_id to detected_trackers
    op.add_column(
        'detected_trackers',
        sa.Column('purpose_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('purposes.id', ondelete='SET NULL'), nullable=True)
    )

    # Add purpose_id to tracker_overrides
    op.add_column(
        'tracker_overrides',
        sa.Column('purpose_id', sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey('purposes.id', ondelete='SET NULL'), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('tracker_overrides', 'purpose_id')
    op.drop_column('detected_trackers', 'purpose_id')
    op.drop_column('integration_properties', 'consent_notice_id')
