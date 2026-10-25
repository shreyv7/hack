"""
Embedding service — provider-aware vectors for Vajra AI RAG.

  * ``AI_PROVIDER=vertex``  — Gemini Embedding (``gemini-embedding-001``)
  * ``AI_PROVIDER=bedrock`` — Amazon Titan Text Embeddings V2

Both paths emit 1 024-dimension vectors so the existing ``doc_embeddings``
pgvector column stays unchanged. Switching providers changes the vector
space — content hashes include the provider so chunks are re-indexed.
"""

from __future__ import annotations

import logging
import threading
from functools import lru_cache
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.doc_embedding import DocEmbedding

logger = logging.getLogger(__name__)

_embed_lock = threading.Lock()


# ── Bedrock client (re-uses the same credential resolution as vajra_ai_service) ──


@lru_cache(maxsize=1)
def _get_bedrock_client() -> Any:
    """Build (once) a Bedrock runtime client for embedding calls."""
    try:
        import boto3
    except ImportError as exc:
        raise RuntimeError(
            "boto3 is not installed. Run: pip install -r requirements.txt"
        ) from exc

    kwargs: dict[str, Any] = {"region_name": settings.AWS_REGION}
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if settings.AWS_SESSION_TOKEN:
            kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

    return boto3.client("bedrock-runtime", **kwargs)


# ── Public API ────────────────────────────────────────────────────────────────


def embed_text(text_input: str, *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """Return a 1 024-dimension embedding for *text_input*.

    Vertex uses ``task_type`` (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY).
    Bedrock Titan ignores it.
    """
    if settings.ai_provider == "vertex":
        from app.services.vertex_ai_client import embed_text as vertex_embed_text

        with _embed_lock:
            return vertex_embed_text(text_input, task_type=task_type)

    if settings.ai_provider == "gemma":
        # Pure Gemma 4 open-weights mode (no AWS Bedrock dependency)
        return [0.0] * 1024

    import json

    client = _get_bedrock_client()

    body = json.dumps({
        "inputText": text_input,
        "dimensions": 1024,
        "normalize": True,
    })

    with _embed_lock:
        response = client.invoke_model(
            modelId=settings.BEDROCK_EMBED_MODEL_ID,
            contentType="application/json",
            accept="application/json",
            body=body,
        )

    result = json.loads(response["body"].read())
    return result["embedding"]


def embed_batch(texts: list[str], *, delay: float = 0.02) -> list[list[float]]:
    """Embed a list of texts sequentially (Titan V2 is single-text only).

    A small *delay* between calls prevents Bedrock throttling.
    """
    import time

    embeddings: list[list[float]] = []
    for i, t in enumerate(texts):
        embeddings.append(embed_text(t))
        if delay and i < len(texts) - 1:
            time.sleep(delay)
    return embeddings


def search_similar(
    query: str,
    db: Session,
    *,
    top_k: int | None = None,
) -> list[DocEmbedding]:
    """Embed *query* and return the *top_k* most similar doc chunks.

    Uses pgvector's ``<=>`` operator for cosine distance (lower = closer).
    """
    k = top_k or settings.RAG_TOP_K
    if settings.ai_provider == "gemma":
        return []

    try:
        query_vec = embed_text(query, task_type="RETRIEVAL_QUERY")
    except Exception:
        logger.warning("Embedding call failed — RAG context will be empty", exc_info=True)
        return []

    # Build the vector literal string for pgvector.
    vec_literal = "[" + ",".join(str(v) for v in query_vec) + "]"

    results = (
        db.query(DocEmbedding)
        .order_by(
            DocEmbedding.embedding.cosine_distance(query_vec)
        )
        .limit(k)
        .all()
    )

    return results
