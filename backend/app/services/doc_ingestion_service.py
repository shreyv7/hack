"""
Document Ingestion Service — reads, filters, chunks, embeds and stores
platform documentation for Shield AI's RAG pipeline.

Key design decisions
--------------------
* **Content filtering**: Sections about backend internals (API endpoints,
  database schemas, routers, migrations) are *excluded* so Shield AI never
  leaks architecture details to platform users.
* **Change detection**: Each chunk is SHA-256 hashed.  On re-index, only
  new/changed chunks are embedded, and chunks for deleted files are removed.
* **Section-aware chunking**: We split on ``## `` headers first, then
  subdivide large sections into ~1 000-char chunks with 200-char overlap.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.doc_embedding import DocEmbedding
from app.services import embedding_service

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

def _docs_root() -> Path:
    """Platform docs used for Shield AI RAG.

    Local uvicorn: repo-level ``docs/`` (three parents above this file).
    Docker: set ``SHIELD_AI_DOCS_DIR`` to the mounted docs path.
    """
    configured = (settings.SHIELD_AI_DOCS_DIR or "").strip()
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[3] / "docs"

# Files that are explicitly excluded (infrastructure / DevOps only).
_EXCLUDED_FILES = {"startup.md", "docker.md", "provider_setup_whitepaper.md"}

# Section titles that contain backend internals.  Case-insensitive match
# against the text after ``## `` (with an optional leading number like "9.").
_EXCLUDED_SECTION_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"backend\s+architecture", re.IGNORECASE),
    re.compile(r"database\s+(design|schema)", re.IGNORECASE),
    re.compile(r"api\s+(design|endpoint)", re.IGNORECASE),
    re.compile(r"event\s+architecture", re.IGNORECASE),
    re.compile(r"\brouter\b", re.IGNORECASE),
    re.compile(r"\bmigration\b", re.IGNORECASE),
    re.compile(r"\balembic\b", re.IGNORECASE),
    re.compile(r"\bsql\b", re.IGNORECASE),
]


# ── Data structures ───────────────────────────────────────────────────────────


@dataclass
class Chunk:
    """A single indexable piece of documentation."""

    source_file: str       # relative path inside docs/
    section_title: str
    chunk_index: int
    content: str
    content_hash: str = ""

    def __post_init__(self) -> None:
        if not self.content_hash:
            fingerprint = (
                f"{settings.ai_provider}:{settings.resolved_embed_model_id}:"
                f"{settings.resolved_embed_dimensions}\n{self.content}"
            )
            self.content_hash = hashlib.sha256(fingerprint.encode()).hexdigest()


@dataclass
class IngestionStats:
    files_processed: int = 0
    total_chunks: int = 0
    new_or_updated: int = 0
    removed: int = 0
    skipped_unchanged: int = 0
    errors: list[str] = field(default_factory=list)
    elapsed_seconds: float = 0.0


# ── Public API ────────────────────────────────────────────────────────────────


class DocIngestionService:
    """Orchestrates the full ingest → chunk → embed → store pipeline."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def ingest_all(self) -> dict:
        """Run the full ingestion pipeline.  Returns a summary dict."""
        t0 = time.time()
        stats = IngestionStats()

        logger.info("📄 Starting documentation ingestion from %s", _docs_root())

        # 1. Discover and chunk all eligible files.
        all_chunks = list(self._discover_and_chunk())
        stats.files_processed = len({c.source_file for c in all_chunks})
        stats.total_chunks = len(all_chunks)

        # 2. Load existing hashes from the database.
        existing: dict[tuple[str, str, int], DocEmbedding] = {}
        for row in self.db.query(DocEmbedding).all():
            key = (row.source_file, row.section_title, row.chunk_index)
            existing[key] = row

        # 3. Determine which chunks need embedding.
        to_embed: list[Chunk] = []
        seen_keys: set[tuple[str, str, int]] = set()

        for chunk in all_chunks:
            key = (chunk.source_file, chunk.section_title, chunk.chunk_index)
            seen_keys.add(key)

            if key in existing and existing[key].content_hash == chunk.content_hash:
                stats.skipped_unchanged += 1
                continue

            to_embed.append(chunk)

        # 4. Remove chunks that no longer exist in the docs.
        stale_keys = set(existing.keys()) - seen_keys
        for stale_key in stale_keys:
            self.db.delete(existing[stale_key])
            stats.removed += 1

        # 5. Embed new/changed chunks and upsert.
        if to_embed:
            logger.info("🧩 Embedding %d new/changed chunks …", len(to_embed))
            self._embed_and_upsert(to_embed, existing, stats)
        else:
            logger.info("✅ All chunks are up-to-date, nothing to embed.")

        self.db.commit()

        stats.elapsed_seconds = round(time.time() - t0, 2)
        summary = {
            "files_processed": stats.files_processed,
            "total_chunks": stats.total_chunks,
            "new_or_updated": stats.new_or_updated,
            "removed": stats.removed,
            "skipped_unchanged": stats.skipped_unchanged,
            "elapsed_seconds": stats.elapsed_seconds,
            "errors": stats.errors,
        }
        logger.info("📊 Ingestion complete: %s", summary)
        return summary

    # ── Internals ─────────────────────────────────────────────────────────────

    def _discover_and_chunk(self) -> Iterator[Chunk]:
        """Walk the docs tree, filter content, and yield ``Chunk`` objects."""
        docs_root = _docs_root()
        if not docs_root.is_dir():
            logger.warning("Docs directory not found: %s", docs_root)
            return

        for md_path in sorted(docs_root.rglob("*.md")):
            if md_path.name in _EXCLUDED_FILES:
                continue

            rel_path = str(md_path.relative_to(docs_root))
            text = md_path.read_text(encoding="utf-8", errors="replace")

            for chunk in self._parse_and_chunk(rel_path, text):
                yield chunk

    def _parse_and_chunk(self, rel_path: str, text: str) -> Iterator[Chunk]:
        """Split a Markdown file into section-aware, filtered chunks."""
        sections = _split_into_sections(text)

        for section_title, section_body in sections:
            # Check if this section should be excluded.
            stripped_title = re.sub(r"^\d+\.\s*", "", section_title).strip()
            if any(p.search(stripped_title) for p in _EXCLUDED_SECTION_PATTERNS):
                continue

            # Split large sections into smaller chunks.
            sub_chunks = _chunk_text(
                section_body,
                max_size=settings.RAG_CHUNK_SIZE,
                overlap=settings.RAG_CHUNK_OVERLAP,
            )

            for idx, chunk_text in enumerate(sub_chunks):
                if chunk_text.strip():
                    yield Chunk(
                        source_file=rel_path,
                        section_title=section_title,
                        chunk_index=idx,
                        content=chunk_text.strip(),
                    )

    def _embed_and_upsert(
        self,
        chunks: list[Chunk],
        existing: dict[tuple[str, str, int], DocEmbedding],
        stats: IngestionStats,
    ) -> None:
        """Embed each chunk and insert/update in the database."""
        for i, chunk in enumerate(chunks):
            try:
                vec = embedding_service.embed_text(chunk.content)
            except Exception as exc:
                msg = f"Embedding failed for {chunk.source_file}::{chunk.section_title}[{chunk.chunk_index}]: {exc}"
                logger.error(msg)
                stats.errors.append(msg)
                continue

            key = (chunk.source_file, chunk.section_title, chunk.chunk_index)

            if key in existing:
                # Update in-place.
                row = existing[key]
                row.content = chunk.content
                row.content_hash = chunk.content_hash
                row.embedding = vec
            else:
                # Insert new row.
                row = DocEmbedding(
                    source_file=chunk.source_file,
                    section_title=chunk.section_title,
                    chunk_index=chunk.chunk_index,
                    content=chunk.content,
                    content_hash=chunk.content_hash,
                    embedding=vec,
                )
                self.db.add(row)

            stats.new_or_updated += 1

            # Log progress every 25 chunks.
            if (i + 1) % 25 == 0:
                logger.info("  … embedded %d / %d chunks", i + 1, len(chunks))

            # Small delay to avoid Bedrock throttling.
            if i < len(chunks) - 1:
                time.sleep(0.02)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _split_into_sections(text: str) -> list[tuple[str, str]]:
    """Split Markdown *text* into ``(section_title, section_body)`` pairs.

    Splits on ``## `` (level-2 headings).  Content before the first ``## ``
    is placed under a synthetic "Introduction" section.
    """
    # Match lines that begin with "## " at line start.
    pattern = re.compile(r"^(## .+)$", re.MULTILINE)
    splits = pattern.split(text)

    sections: list[tuple[str, str]] = []

    # splits[0] is text before the first ## heading.
    preamble = splits[0].strip()
    if preamble:
        # Extract the title from the first # heading if present.
        h1_match = re.match(r"^#\s+(.+)$", preamble, re.MULTILINE)
        title = h1_match.group(1).strip() if h1_match else "Introduction"
        sections.append((title, preamble))

    # Remaining items alternate between heading and body.
    for i in range(1, len(splits), 2):
        heading = splits[i].replace("## ", "").strip()
        body = splits[i + 1].strip() if i + 1 < len(splits) else ""
        if heading and body:
            sections.append((heading, body))

    return sections


def _chunk_text(
    text: str,
    *,
    max_size: int = 1000,
    overlap: int = 200,
) -> list[str]:
    """Split *text* into overlapping chunks of at most *max_size* characters.

    Tries to split on paragraph boundaries (double newlines) first, then
    on single newlines, and finally on spaces.
    """
    if len(text) <= max_size:
        return [text]

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = start + max_size

        if end >= len(text):
            chunks.append(text[start:])
            break

        # Try to find a natural break point.
        candidate = text[start:end]

        # Prefer paragraph break.
        para_break = candidate.rfind("\n\n")
        if para_break > max_size // 3:
            end = start + para_break + 2
        else:
            # Prefer line break.
            line_break = candidate.rfind("\n")
            if line_break > max_size // 3:
                end = start + line_break + 1
            else:
                # Prefer word break.
                space_break = candidate.rfind(" ")
                if space_break > max_size // 3:
                    end = start + space_break + 1

        chunks.append(text[start:end].strip())
        start = max(end - overlap, start + 1)  # overlap with previous chunk

    return [c for c in chunks if c]
