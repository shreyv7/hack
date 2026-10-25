"""Add tag_manager_settings and tag_execution_logs tables."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260630_tag_manager_enterprise"
down_revision: Union[str, None] = "20260630_consent_webhook_url"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tag_execution_logs",
        sa.Column("property_id", sa.UUID(), nullable=False),
        sa.Column("tag_id", sa.UUID(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("executed", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("blocked", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("purpose_name", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["integration_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["managed_tags.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tag_execution_logs_property_id", "tag_execution_logs", ["property_id"])
    op.create_index("ix_tag_execution_logs_tag_id", "tag_execution_logs", ["tag_id"])
    op.create_index("ix_tag_execution_logs_date", "tag_execution_logs", ["date"])

    op.create_table(
        "tag_manager_settings",
        sa.Column("property_id", sa.UUID(), nullable=False),
        sa.Column("consent_mode_v2", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("auto_blocker_strict", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("datalayer_event_prefix", sa.String(length=50), nullable=False, server_default="vajra"),
        sa.Column("blocked_purposes", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["integration_properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("property_id"),
    )
    op.create_index("ix_tag_manager_settings_property_id", "tag_manager_settings", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_tag_manager_settings_property_id", table_name="tag_manager_settings")
    op.drop_table("tag_manager_settings")
    op.drop_index("ix_tag_execution_logs_date", table_name="tag_execution_logs")
    op.drop_index("ix_tag_execution_logs_tag_id", table_name="tag_execution_logs")
    op.drop_index("ix_tag_execution_logs_property_id", table_name="tag_execution_logs")
    op.drop_table("tag_execution_logs")
