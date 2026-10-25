"""banner_purpose_type to JSON array

Revision ID: 20260701_banner_purpose_multiple
Revises: 66cd528dbd9c
Create Date: 2026-07-01 16:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '20260701_banner_purpose_multiple'
down_revision: Union[str, None] = '66cd528dbd9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Step 1: Drop the existing server default (which is a plain string)
    op.execute("ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type DROP DEFAULT")
    # Step 2: Cast the existing string values to JSON array and change column type
    op.execute(
        "ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type "
        "TYPE JSON USING json_build_array(banner_purpose_type)"
    )
    # Step 3: Set the new server default as a JSON array
    op.execute(
        "ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type "
        "SET DEFAULT '[\"cookie\"]'::json"
    )


def downgrade() -> None:
    # Step 1: Drop the JSON default
    op.execute("ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type DROP DEFAULT")
    # Step 2: Cast back to varchar, taking the first element of the array
    op.execute(
        "ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type "
        "TYPE VARCHAR(50) USING COALESCE(banner_purpose_type->>0, 'cookie')"
    )
    # Step 3: Restore the old string default
    op.execute(
        "ALTER TABLE consent_banners ALTER COLUMN banner_purpose_type SET DEFAULT 'cookie'"
    )
