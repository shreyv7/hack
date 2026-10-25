"""
Document Embedding — stores chunked platform documentation with vector
embeddings for Vajra AI's RAG (Retrieval-Augmented Generation) pipeline.

Each row is a single chunk of a Markdown documentation file.  The
``embedding`` column holds a 1 024-dimension vector (Titan V2 or Vertex
``gemini-embedding-001`` with output_dimensionality=1024), indexed via
pgvector for fast cosine-similarity search.
"""

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID

from app.core.database import Base


class DocEmbedding(Base):
    __tablename__ = "doc_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_file = Column(String, nullable=False)       # e.g. "Consent Management/create_consent.md"
    section_title = Column(String, nullable=False)     # e.g. "3. End-to-End User Journey"
    chunk_index = Column(Integer, nullable=False)      # order within the section
    content = Column(Text, nullable=False)             # raw text of the chunk
    content_hash = Column(String(64), nullable=False)  # SHA-256 for change detection
    embedding = Column(Vector(1024), nullable=False)   # Titan V2 / Vertex embed = 1024 dims
    created_at = Column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    __table_args__ = (
        UniqueConstraint(
            "source_file", "section_title", "chunk_index",
            name="uq_doc_embedding_file_section_chunk",
        ),
        # HNSW index for fast cosine similarity search.  pgvector creates the
        # operator class automatically; we just need to declare the index.
        Index(
            "ix_doc_embeddings_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    def __repr__(self) -> str:
        return (
            f"<DocEmbedding {self.source_file}::{self.section_title}"
            f" chunk={self.chunk_index}>"
        )
