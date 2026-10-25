"""Vajra AI Vision — screenshot Q&A via the active AI provider (Vertex or Bedrock)."""

from __future__ import annotations

import base64
import binascii
import logging
import re
from typing import Any

from app.core.config import settings
from app.services.vajra_ai_service import (
    VajraAIError,
    _call_lock,
    _ensure_bedrock_credentials,
    _friendly_error,
    _get_client,
    _is_retryable_model_error,
)

logger = logging.getLogger(__name__)

_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded

_VISION_SYSTEM_PROMPT = (
    "You are Vajra AI Vision, a screenshot Q&A assistant embedded in Vajra. "
    "The user captures a region of the application UI and asks a question about it. "
    "Explain what the feature or UI element is for, why it exists, and how to use it. "
    "Answer concisely in plain language. If you cannot determine something from the image, say so."
)


def _strip_data_url(image_base64: str) -> tuple[str, str]:
    """Return (raw_base64, format) from a data URL or plain base64 string."""
    match = re.match(r"^data:image/(jpeg|jpg|png|webp|gif);base64,(.+)$", image_base64, re.I)
    if match:
        fmt = match.group(1).lower()
        if fmt == "jpg":
            fmt = "jpeg"
        return match.group(2), fmt
    return image_base64, "jpeg"


class VisionAssistService:
    """Stateless vision calls — no DB writes, no image storage."""

    def answer(self, image_base64: str, question: str) -> str:
        if not settings.ai_vision_configured:
            raise VajraAIError(
                "Vajra AI Vision is not configured on the server. Set VERTEX_MODEL_ID "
                "(Gemini 2.5 Flash is multimodal) or BEDROCK_VISION_MODEL_ID in the backend .env."
            )

        raw_b64, image_format = _strip_data_url(image_base64.strip())
        try:
            image_bytes = base64.b64decode(raw_b64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise VajraAIError("Invalid image data. Please capture again.") from exc

        if len(image_bytes) > _MAX_IMAGE_BYTES:
            raise VajraAIError("Image is too large. Please capture a smaller region.")

        if settings.ai_provider == "vertex":
            try:
                return self._answer_vertex(image_bytes, image_format, question)
            finally:
                del image_bytes

        _ensure_bedrock_credentials()

        model_ids = settings.resolved_vision_model_ids
        if not model_ids:
            raise VajraAIError(
                "Vajra AI Vision is not configured on the server. Set BEDROCK_MODEL_ID "
                "or BEDROCK_VISION_MODEL_ID in the backend .env."
            )

        client = _get_client()
        last_exc: Exception | None = None

        try:
            for model_id in model_ids:
                request: dict[str, Any] = {
                    "modelId": model_id,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "image": {
                                        "format": image_format,
                                        "source": {"bytes": image_bytes},
                                    }
                                },
                                {"text": question.strip()},
                            ],
                        }
                    ],
                    "system": [{"text": _VISION_SYSTEM_PROMPT}],
                    "inferenceConfig": {
                        "maxTokens": settings.BEDROCK_VISION_MAX_TOKENS,
                        "temperature": 0.3,
                    },
                }

                try:
                    with _call_lock:
                        response = client.converse(**request)
                    reply = _extract_text(response)
                    if reply:
                        return reply
                    raise VajraAIError(
                        "Vajra AI Vision returned an empty response. Please try again."
                    )
                except VajraAIError:
                    raise
                except Exception as exc:
                    last_exc = exc
                    if _is_retryable_model_error(exc) and model_id != model_ids[-1]:
                        logger.warning(
                            "Vajra AI Vision model %s unavailable, trying next: %s",
                            model_id,
                            exc,
                        )
                        continue
                    logger.exception("Vajra AI Vision provider call failed (model=%s)", model_id)
                    raise VajraAIError(_friendly_error(exc)) from exc
        finally:
            del image_bytes

        if last_exc is not None:
            raise VajraAIError(_friendly_error(last_exc)) from last_exc
        raise VajraAIError("Vajra AI Vision is temporarily unavailable. Please try again.")

    def _answer_vertex(self, image_bytes: bytes, image_format: str, question: str) -> str:
        from app.services.vertex_ai_client import generate_vision

        mime_type = f"image/{image_format}" if image_format != "jpg" else "image/jpeg"
        try:
            reply = generate_vision(
                image_bytes=image_bytes,
                mime_type=mime_type,
                question=question,
                system=_VISION_SYSTEM_PROMPT,
                max_tokens=settings.VERTEX_VISION_MAX_TOKENS,
                temperature=0.3,
            )
        except Exception as exc:
            logger.exception("Vajra AI Vision Vertex call failed")
            raise VajraAIError(_friendly_error(exc)) from exc
        if not reply:
            raise VajraAIError(
                "Vajra AI Vision returned an empty response. Please try again."
            )
        return reply


def _extract_text(response: dict[str, Any]) -> str:
    output = response.get("output") or {}
    message = output.get("message") or {}
    parts: list[str] = []
    for block in message.get("content") or []:
        text = block.get("text")
        if text:
            parts.append(text)
    return "\n".join(parts).strip()
