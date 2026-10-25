"""Data source taxonomy: free-form source_type + category column.

Converts data_sources.source_type from the rigid `data_source_type` enum to a
plain varchar (so new connectors need no migration) and adds a `category`
column (database | cloud | files | api | logs | upload). Existing rows keep
their slug; we backfill `category` for the slugs that existed before.

Revision ID: 20260619_dstax
Revises: 2776c22ef050
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260619_dstax"
down_revision = "2776c22ef050"
branch_labels = None
depends_on = None


# slug -> category for the connectors that existed before this migration.
_LEGACY_CATEGORY = {
    "postgresql": "database",
    "mysql": "database",
    "mongodb": "database",
    "s3": "files",
    "azure_blob": "files",
    "bigquery": "cloud",
    "snowflake": "cloud",
    "salesforce": "cloud",
    "api": "api",
    "other": "database",
}


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Add the new category column (nullable — legacy rows backfilled below).
    op.add_column("data_sources", sa.Column("category", sa.String(length=32), nullable=True))

    # 2. Convert source_type enum -> varchar so any connector slug can be stored.
    #    USING cast preserves existing values as their text form.
    op.alter_column(
        "data_sources",
        "source_type",
        existing_type=sa.Enum(name="data_source_type"),
        type_=sa.String(length=64),
        existing_nullable=False,
        postgresql_using="source_type::text",
    )

    # 3. The enum type is no longer referenced — drop it.
    sa.Enum(name="data_source_type").drop(bind, checkfirst=True)

    # 4. Backfill category for pre-existing rows.
    for slug, category in _LEGACY_CATEGORY.items():
        op.execute(
            sa.text(
                "UPDATE data_sources SET category = :cat "
                "WHERE source_type = :slug AND category IS NULL"
            ).bindparams(cat=category, slug=slug)
        )


def downgrade() -> None:
    bind = op.get_bind()

    # Recreate the original enum and cast back. Rows whose slug isn't part of the
    # original enum would fail the cast, so coerce unknown slugs to 'other' first.
    legacy_values = (
        "postgresql", "mysql", "mongodb", "s3", "azure_blob",
        "bigquery", "snowflake", "salesforce", "api", "other",
    )
    op.execute(
        sa.text(
            "UPDATE data_sources SET source_type = 'other' "
            "WHERE source_type NOT IN :vals"
        ).bindparams(sa.bindparam("vals", value=legacy_values, expanding=True))
    )

    data_source_type = sa.Enum(*legacy_values, name="data_source_type")
    data_source_type.create(bind, checkfirst=True)
    op.alter_column(
        "data_sources",
        "source_type",
        existing_type=sa.String(length=64),
        type_=data_source_type,
        existing_nullable=False,
        postgresql_using="source_type::data_source_type",
    )

    op.drop_column("data_sources", "category")
