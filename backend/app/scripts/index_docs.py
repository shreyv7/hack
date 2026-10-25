"""
CLI script — index platform documentation for Vajra AI RAG.

Usage (from the backend directory):
    python -m app.scripts.index_docs

This reads all Markdown files in ``docs/``, strips backend-only sections,
chunks the remaining user-facing content, embeds via the active AI
provider, and upserts into the ``doc_embeddings`` table.
"""

from __future__ import annotations

import logging
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> None:
    from app.core.config import settings

    if not settings.ai_configured:
        logger.error(
            "❌ Vajra AI is not configured — cannot generate embeddings.  "
            "Set AI_PROVIDER=vertex with GOOGLE_CLOUD_PROJECT, or "
            "AI_PROVIDER=bedrock with BEDROCK_MODEL_ID, then try again."
        )
        sys.exit(1)

    from app.core.database import SessionLocal
    from app.services.doc_ingestion_service import DocIngestionService

    db = SessionLocal()
    try:
        logger.info("🚀 Starting Vajra AI documentation indexing …")
        stats = DocIngestionService(db).ingest_all()
        logger.info("✅ Done!  Summary: %s", stats)

        if stats.get("errors"):
            logger.warning("⚠️  %d embedding errors occurred — see above.", len(stats["errors"]))
            sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
