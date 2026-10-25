"""Normalize Indian phone numbers to +91XXXXXXXXXX

Revision ID: 20260612_india_phone
Revises: 20260611_dsar_verify
Create Date: 2026-06-12
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "20260612_india_phone"
down_revision: Union[str, None] = "20260611_dsar_verify"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalize_phone_sql(column: str) -> str:
    digits = f"regexp_replace({column}, '[^0-9]', '', 'g')"
    local = (
        f"CASE "
        f"WHEN length({digits}) = 10 THEN {digits} "
        f"WHEN length({digits}) = 12 AND {digits} LIKE '91%' THEN substring({digits} from 3 for 10) "
        f"ELSE NULL END"
    )
    return (
        f"CASE "
        f"WHEN {column} IS NULL OR trim({column}) = '' THEN NULL "
        f"WHEN {local} IS NOT NULL THEN '+91' || {local} "
        f"ELSE NULL END"
    )


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE data_rights_requests
        SET requester_phone = {_normalize_phone_sql('requester_phone')}
        WHERE requester_phone IS NOT NULL AND trim(requester_phone) <> ''
        """
    )
    op.execute(
        f"""
        UPDATE organization_settings
        SET dpo_phone = {_normalize_phone_sql('dpo_phone')}
        WHERE dpo_phone IS NOT NULL AND trim(dpo_phone) <> ''
        """
    )
    op.create_check_constraint(
        "ck_data_rights_requests_requester_phone",
        "data_rights_requests",
        "requester_phone IS NULL OR requester_phone ~ '^\\+91[0-9]{10}$'",
    )
    op.create_check_constraint(
        "ck_organization_settings_dpo_phone",
        "organization_settings",
        "dpo_phone IS NULL OR dpo_phone ~ '^\\+91[0-9]{10}$'",
    )


def downgrade() -> None:
    op.drop_constraint("ck_organization_settings_dpo_phone", "organization_settings", type_="check")
    op.drop_constraint("ck_data_rights_requests_requester_phone", "data_rights_requests", type_="check")
