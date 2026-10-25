"""Overlay assistant — org-scoped team comments."""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260805_overlay_comments"
down_revision: Union[str, None] = "20260804_inventory_gov"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "overlay_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_overlay_comments_organization_id",
        "overlay_comments",
        ["organization_id"],
    )
    op.create_index(
        "ix_overlay_comments_user_id",
        "overlay_comments",
        ["user_id"],
    )
    op.create_index(
        "ix_overlay_comments_created_at",
        "overlay_comments",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_overlay_comments_created_at", table_name="overlay_comments")
    op.drop_index("ix_overlay_comments_user_id", table_name="overlay_comments")
    op.drop_index("ix_overlay_comments_organization_id", table_name="overlay_comments")
    op.drop_table("overlay_comments")
