"""
Bedrock Translation Service — primary translation engine for the DPDPA Multi-Language Editor.

Uses the existing Shield AI converse() helper (Vertex or Bedrock via AI_PROVIDER)
to translate consent banner and consent notice text into all 22 Eighth Schedule languages.

Designed as the first tier in a cascading fallback chain:
  1. Shield AI (this module)  → production quality, 99.9% SLA
  2. LibreTranslate mirrors → free open-source fallback
  3. MyMemory API           → free crowdsourced fallback
  4. Local dictionary       → always-available hardcoded phrases
"""

from __future__ import annotations

import logging
from typing import NamedTuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Language metadata: ISO code → human-readable name (for the system prompt)
# ---------------------------------------------------------------------------
_LANGUAGE_NAMES: dict[str, str] = {
    "hi":  "Hindi (Devanagari script)",
    "bn":  "Bengali (Bangla script)",
    "ta":  "Tamil (Tamil script)",
    "te":  "Telugu (Telugu script)",
    "mr":  "Marathi (Devanagari script)",
    "kn":  "Kannada (Kannada script)",
    "ml":  "Malayalam (Malayalam script)",
    "gu":  "Gujarati (Gujarati script)",
    "pa":  "Punjabi (Gurmukhi script)",
    "ur":  "Urdu (Perso-Arabic Nastaliq script)",
    "or":  "Odia (Odia script)",
    "as":  "Assamese (Bengali-Assamese script)",
    "kok": "Konkani (Devanagari script)",
    "ne":  "Nepali (Devanagari script)",
    "sa":  "Sanskrit (Devanagari script)",
    "sd":  "Sindhi (Perso-Arabic script)",
    "brx": "Bodo (Devanagari script)",
    "doi": "Dogri (Devanagari script)",
    "ks":  "Kashmiri (Perso-Arabic script)",
    "mai": "Maithili (Devanagari script)",
    "mni": "Manipuri / Meitei (Bengali script or Meitei Mayek script)",
    "sat": "Santali (Ol Chiki script)",
}

_SYSTEM_PROMPT_TEMPLATE = (
    "You are a precise legal document translator specializing in Indian official languages "
    "under the Eighth Schedule of the Constitution of India.\n\n"
    "Your task: Translate the following text from English to {target_language}.\n\n"
    "Rules — follow these exactly:\n"
    "1. Preserve the formal, legal register throughout. Use respectful, formal second-person "
    "pronouns (e.g. आप/आपका for Hindi, நீங்கள் for Tamil, మీరు for Telugu).\n"
    "2. Keep any template placeholders like {{recipient_name}} or {{company_name}} "
    "completely unchanged — they are replaced at runtime.\n"
    "3. Preserve all paragraph breaks, line breaks, and spacing as-is.\n"
    "4. Do NOT translate: URLs, email addresses, proper nouns (company names, product names), "
    "or legal act references like \"DPDPA 2023\" or \"Section 5\".\n"
    "5. Do NOT add explanatory parenthetical notes, translator comments, or alternative "
    "translations.\n"
    "6. Output ONLY the translated text — no preamble, no \"Here is the translation:\", "
    "no quotation marks wrapping the output.\n"
    "7. Ensure correct Unicode script is used for the target language (e.g. Ol Chiki for "
    "Santali, Gurmukhi for Punjabi, Nastaliq for Urdu/Kashmiri)."
)


class TranslationResult(NamedTuple):
    translated_text: str
    source: str  # Active AI provider name, or "bedrock" for empty input


class BedrockTranslationError(RuntimeError):
    """Raised when Bedrock translation fails — triggers fallback chain."""


def translate_via_bedrock(text: str, target_lang_code: str) -> TranslationResult:
    """Translate *text* from English into the language identified by *target_lang_code*.

    Raises ``BedrockTranslationError`` on any failure so the caller can fall back
    to the open-source pipeline.

    Args:
        text: Source English text to translate.
        target_lang_code: ISO 639 language code (e.g. "hi", "ta", "sat").

    Returns:
        ``TranslationResult(translated_text, source=<ai_provider>)``
    """
    from app.core.config import settings
    from app.services.shield_ai_service import ShieldAIError, converse

    if not text or not text.strip():
        return TranslationResult(translated_text="", source=settings.ai_provider)

    if not settings.ai_configured:
        raise BedrockTranslationError(
            "Shield AI is not configured (set AI_PROVIDER plus Vertex or Bedrock settings)."
        )

    target_language = _LANGUAGE_NAMES.get(
        target_lang_code,
        f"language with ISO code '{target_lang_code}'"
    )
    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(target_language=target_language)

    user_message = (
        f"Translate the following English consent text into {target_language}.\n\n"
        f"---\n{text.strip()}\n---"
    )

    try:
        translated = converse(
            messages=[{"role": "user", "content": user_message}],
            system=system_prompt,
            # Translation is a short, deterministic task — cap tokens aggressively
            # to avoid runaway costs (output is rarely longer than the source).
            max_tokens=1024,
            # Low temperature for deterministic, faithful translations
            temperature=0.1,
        )
    except ShieldAIError as exc:
        logger.warning("AI translation failed for lang=%s: %s", target_lang_code, exc)
        raise BedrockTranslationError(str(exc)) from exc
    except Exception as exc:
        logger.warning(
            "Unexpected error during AI translation for lang=%s: %s",
            target_lang_code, exc,
        )
        raise BedrockTranslationError(str(exc)) from exc

    translated = translated.strip()
    if not translated:
        raise BedrockTranslationError("Shield AI returned an empty translation.")

    logger.info(
        "AI translation OK: provider=%s lang=%s, input_chars=%d, output_chars=%d",
        settings.ai_provider, target_lang_code, len(text), len(translated),
    )
    return TranslationResult(translated_text=translated, source=settings.ai_provider)
