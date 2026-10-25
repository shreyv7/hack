"""add doc_embeddings table with pgvector

Revision ID: 20260625_doc_embeddings
Revises: ed233bd8cc8f
Create Date: 2026-06-25 13:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision: str = '20260625_doc_embeddings'
down_revision: Union[str, None] = 'ed233bd8cc8f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Enable pgvector extension (idempotent).
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "doc_embeddings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_file", sa.String(), nullable=False),
        sa.Column("section_title", sa.String(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        # 1024-dim vector for Titan Embed V2
        sa.Column("embedding", sa.Column("vector(1024)").type if False else sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "source_file", "section_title", "chunk_index",
            name="uq_doc_embedding_file_section_chunk",
        ),
    )

    # The pgvector column needs to be added via raw SQL because Alembic
    # doesn't natively understand the ``vector`` type.
    op.execute(
        "ALTER TABLE doc_embeddings "
        "ALTER COLUMN embedding TYPE vector(1024) USING embedding::vector(1024)"
    )

    # HNSW index for cosine similarity search.
    op.execute(
        "CREATE INDEX ix_doc_embeddings_embedding_hnsw "
        "ON doc_embeddings USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.drop_table("doc_embeddings")
    # NOTE: we do NOT drop the vector extension — other tables may use it.
