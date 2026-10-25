"""
Vertex AI client for Vajra AI.

Uses the Google Gen AI SDK against Vertex AI. Credentials come from
Application Default Credentials (ADC) — no API key.

Local:  gcloud auth application-default login
Cloud Run: the runtime service account.
"""

from __future__ import annotations

import logging
import math
import threading
from functools import lru_cache
from typing import Any, Iterator

from app.core.config import settings

logger = logging.getLogger(__name__)

_call_lock = threading.Lock()


@lru_cache(maxsize=1)
def get_vertex_client() -> Any:
    """Build (once) a Vertex AI Gen AI client using ADC."""
    try:
        from google import genai
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise RuntimeError(
            "google-genai is not installed. Run: pip install -r requirements.txt"
        ) from exc

    project = settings.GOOGLE_CLOUD_PROJECT.strip()
    location = settings.GOOGLE_CLOUD_LOCATION.strip() or "global"
    if not project:
        raise RuntimeError(
            "GOOGLE_CLOUD_PROJECT is not set. Add it to backend/.env for Vertex AI."
        )

    return genai.Client(vertexai=True, project=project, location=location)


def _thinking_config() -> Any | None:
    try:
        from google.genai import types
    except ImportError:
        return None
    try:
        return types.ThinkingConfig(thinking_budget=settings.VERTEX_THINKING_BUDGET)
    except (TypeError, ValueError, AttributeError):
        return None


def _generate_config(
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> Any:
    from google.genai import types

    kwargs: dict[str, Any] = {
        "max_output_tokens": max_tokens or settings.VERTEX_MAX_TOKENS,
        "temperature": settings.VERTEX_TEMPERATURE if temperature is None else temperature,
    }
    if system:
        kwargs["system_instruction"] = system
    thinking = _thinking_config()
    if thinking is not None:
        kwargs["thinking_config"] = thinking
    return types.GenerateContentConfig(**kwargs)


def _to_contents(messages: list[dict[str, str]]) -> list[Any]:
    from google.genai import types

    contents: list[Any] = []
    for message in messages:
        text = (message.get("content") or "").strip()
        if not text:
            continue
        role = "model" if message.get("role") == "assistant" else "user"
        contents.append(
            types.Content(role=role, parts=[types.Part.from_text(text=text)])
        )
    return contents


def _part_is_thought(part: Any) -> bool:
    return bool(getattr(part, "thought", False))


def extract_text(response: Any) -> str:
    """Return visible model text, skipping thought parts when present."""
    candidates = getattr(response, "candidates", None) or []
    text_parts: list[str] = []
    for candidate in candidates:
        content = getattr(candidate, "content", None)
        parts = getattr(content, "parts", None) or []
        for part in parts:
            if _part_is_thought(part):
                continue
            text = getattr(part, "text", None)
            if isinstance(text, str) and text:
                text_parts.append(text)
    if text_parts:
        return "".join(text_parts).strip()

    fallback = getattr(response, "text", None)
    return fallback.strip() if isinstance(fallback, str) else ""


def generate_text(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
) -> str:
    client = get_vertex_client()
    contents = _to_contents(messages)
    if not contents:
        raise RuntimeError("No message content to send.")

    request = {
        "model": model or settings.VERTEX_MODEL_ID,
        "contents": contents,
        "config": _generate_config(
            system=system, max_tokens=max_tokens, temperature=temperature
        ),
    }
    with _call_lock:
        response = client.models.generate_content(**request)
    return extract_text(response)


def generate_text_stream(
    messages: list[dict[str, str]],
    *,
    system: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
    model: str | None = None,
) -> Iterator[str]:
    client = get_vertex_client()
    contents = _to_contents(messages)
    if not contents:
        raise RuntimeError("No message content to send.")

    request = {
        "model": model or settings.VERTEX_MODEL_ID,
        "contents": contents,
        "config": _generate_config(
            system=system, max_tokens=max_tokens, temperature=temperature
        ),
    }
    with _call_lock:
        stream = client.models.generate_content_stream(**request)

    for chunk in stream:
        text = extract_text(chunk)
        if text:
            yield text


def generate_vision(
    *,
    image_bytes: bytes,
    mime_type: str,
    question: str,
    system: str,
    max_tokens: int | None = None,
    temperature: float = 0.3,
    model: str | None = None,
) -> str:
    from google.genai import types

    client = get_vertex_client()
    contents = [
        types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        question.strip(),
    ]
    request = {
        "model": model or settings.resolved_vertex_vision_model_id,
        "contents": contents,
        "config": _generate_config(
            system=system, max_tokens=max_tokens, temperature=temperature
        ),
    }
    with _call_lock:
        response = client.models.generate_content(**request)
    return extract_text(response)


def _l2_normalize(values: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in values))
    if norm <= 0:
        return values
    return [v / norm for v in values]


def embed_text(text_input: str, *, task_type: str = "RETRIEVAL_DOCUMENT") -> list[float]:
    """Return a Vertex embedding sized to VERTEX_EMBED_DIMENSIONS (default 1024)."""
    from google.genai import types

    client = get_vertex_client()
    config = types.EmbedContentConfig(
        task_type=task_type,
        output_dimensionality=settings.VERTEX_EMBED_DIMENSIONS,
    )
    with _call_lock:
        response = client.models.embed_content(
            model=settings.VERTEX_EMBED_MODEL_ID,
            contents=text_input,
            config=config,
        )

    embeddings = getattr(response, "embeddings", None) or []
    if not embeddings:
        raise RuntimeError("Vertex AI returned no embedding.")
    values = list(getattr(embeddings[0], "values", None) or [])
    if len(values) != settings.VERTEX_EMBED_DIMENSIONS:
        raise RuntimeError(
            f"Vertex embedding dimension mismatch: expected "
            f"{settings.VERTEX_EMBED_DIMENSIONS}, got {len(values)}."
        )
    return _l2_normalize(values)
