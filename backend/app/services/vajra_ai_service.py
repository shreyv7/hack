"""
Vajra AI — provider-agnostic chat, generation, and RAG helpers.

The active backend is selected by ``AI_PROVIDER``:
  * ``vertex``  — Gemini on Vertex AI via Application Default Credentials
  * ``bedrock`` — AWS Bedrock Converse API (original path)

High-level helpers (``chat``, ``generate``, policy/RoPA drafts, …) always
call ``converse`` / ``converse_stream``, so switching providers never
requires changes at the call sites.
"""

from __future__ import annotations

import json
import logging
import re
import threading
from functools import lru_cache
from typing import Any, Iterator

from app.core.config import settings

logger = logging.getLogger(__name__)


class VajraAIError(RuntimeError):
    """Raised when Vajra AI is misconfigured or a provider call fails."""


# A message is {"role": "user"|"assistant", "content": str}
Message = dict[str, str]


@lru_cache(maxsize=1)
def _get_client() -> Any:
    """Build (once) a Bedrock runtime client.

    Credentials resolve from explicit settings if provided, otherwise from the
    default AWS chain (env vars, shared config, instance role).
    """
    try:
        import boto3  # imported lazily so the app boots without boto3 installed
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise VajraAIError(
            "boto3 is not installed. Run: pip install -r requirements.txt"
        ) from exc

    kwargs: dict[str, Any] = {"region_name": settings.AWS_REGION}
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if settings.AWS_SESSION_TOKEN:
            kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

    return boto3.client("bedrock-runtime", **kwargs)


def _bedrock_credentials_available() -> bool:
    """Return True when boto3 can resolve AWS credentials for Bedrock."""
    try:
        import boto3
    except ImportError:
        return False

    kwargs: dict[str, Any] = {"region_name": settings.AWS_REGION}
    if settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY:
        kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if settings.AWS_SESSION_TOKEN:
            kwargs["aws_session_token"] = settings.AWS_SESSION_TOKEN

    creds = boto3.Session(**kwargs).get_credentials()
    return bool(creds and creds.access_key)


def _ensure_bedrock_credentials() -> None:
    if _bedrock_credentials_available():
        return
    raise VajraAIError(
        "Vajra AI is not configured on the server. Your administrator must set "
        "AWS_REGION and AWS credentials (or an instance role), and enable a Bedrock "
        "model — see BEDROCK_MODEL_ID and BEDROCK_VISION_MODEL_ID in .env.example."
    )


# Bedrock's converse() is a blocking boto3 call; guard the shared client.
_call_lock = threading.Lock()


def _ensure_configured() -> None:
    if settings.ai_configured:
        return
    if settings.ai_provider == "gemma":
        raise VajraAIError(
            "Vajra AI with Gemma 4 is not configured. Set GEMINI_API_KEY in .env."
        )
    if settings.ai_provider == "vertex":
        raise VajraAIError(
            "Vajra AI is not configured on the server. Set GOOGLE_CLOUD_PROJECT "
            "and VERTEX_MODEL_ID, and authenticate with Application Default Credentials."
        )
    raise VajraAIError(
        "Vajra AI is not configured on the server. Please contact your administrator."
    )


def converse(
    messages: list[Message],
    *,
    system: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> str:
    """Send a conversation to the active AI provider and return its text."""
    _ensure_configured()
    if settings.ai_provider == "gemma":
        return _converse_gemma(
            messages, system=system, max_tokens=max_tokens, temperature=temperature
        )
    if settings.ai_provider == "vertex":
        return _converse_vertex(
            messages, system=system, max_tokens=max_tokens, temperature=temperature
        )
    return _converse_bedrock(
        messages, system=system, max_tokens=max_tokens, temperature=temperature
    )


def converse_stream(
    messages: list[Message],
    *,
    system: str | None = None,
    max_tokens: int | None = None,
    temperature: float | None = None,
) -> Iterator[str]:
    """Yield text chunks from the active AI provider."""
    _ensure_configured()
    if settings.ai_provider == "gemma":
        yield from _converse_stream_gemma(
            messages, system=system, max_tokens=max_tokens, temperature=temperature
        )
        return
    if settings.ai_provider == "vertex":
        yield from _converse_stream_vertex(
            messages, system=system, max_tokens=max_tokens, temperature=temperature
        )
        return
    yield from _converse_stream_bedrock(
        messages, system=system, max_tokens=max_tokens, temperature=temperature
    )


def _converse_gemma(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> str:
    import requests

    keys = getattr(settings, "all_gemini_api_keys", None) or ([settings.GEMINI_API_KEY] if settings.GEMINI_API_KEY.strip() else [])
    if not keys:
        raise VajraAIError("No GEMINI_API_KEY configured for Gemma 4.")

    contents = []
    if system:
        contents.append(f"System: {system}\n")
    for m in messages:
        role = "Model" if m.get("role") in {"assistant", "model"} else "User"
        contents.append(f"{role}: {m.get('content', '')}")

    prompt_text = "\n\n".join(contents)
    model = settings.GEMMA_MODEL_ID or "gemma-4-26b-a4b-it"

    for key in keys:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
            payload = {
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {
                    "temperature": temperature if temperature is not None else 0.3,
                    "maxOutputTokens": max_tokens or 2048,
                },
            }
            r = requests.post(url, json=payload, timeout=25)
            if r.status_code == 200:
                res = r.json()
                text = ""
                for part in res.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                    if not part.get("thought"):
                        text = part.get("text", "")
                if text.strip():
                    return text.strip()
            else:
                logger.warning("Gemma 4 API returned status %d: %s", r.status_code, r.text[:100])
        except Exception as exc:
            logger.warning("Gemma 4 converse call failed with key ...%s (%s)", key[-6:], type(exc).__name__)
            continue

    raise VajraAIError("Gemma 4 could not generate a response. Please check your API key.")


def _converse_stream_gemma(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> Iterator[str]:
    text = _converse_gemma(messages, system=system, max_tokens=max_tokens, temperature=temperature)
    yield text


def _converse_vertex(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> str:
    from app.services.vertex_ai_client import generate_text

    try:
        reply = generate_text(
            messages,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:
        logger.exception("Vajra AI Vertex call failed")
        raise VajraAIError(_friendly_error(exc)) from exc
    if not reply:
        raise VajraAIError("Vajra AI returned an empty response. Please try again.")
    return reply


def _converse_stream_vertex(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> Iterator[str]:
    from app.services.vertex_ai_client import generate_text_stream

    try:
        yield from generate_text_stream(
            messages,
            system=system,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:
        logger.exception("Vajra AI Vertex stream call failed")
        raise VajraAIError(_friendly_error(exc)) from exc


def _converse_bedrock(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> str:
    client = _get_client()

    bedrock_messages = [
        {"role": m["role"], "content": [{"text": m["content"]}]}
        for m in messages
        if m.get("content")
    ]
    if not bedrock_messages:
        raise VajraAIError("No message content to send.")

    request: dict[str, Any] = {
        "modelId": settings.BEDROCK_MODEL_ID,
        "messages": bedrock_messages,
        "inferenceConfig": {
            "maxTokens": max_tokens or settings.BEDROCK_MAX_TOKENS,
            "temperature": settings.BEDROCK_TEMPERATURE
            if temperature is None
            else temperature,
        },
    }
    if system:
        request["system"] = [{"text": system}]

    try:
        with _call_lock:
            response = client.converse(**request)
    except Exception as exc:  # boto ClientError, EndpointConnectionError, …
        logger.exception("Vajra AI provider call failed")
        raise VajraAIError(_friendly_error(exc)) from exc

    reply = _extract_text(response)
    if not reply:
        raise VajraAIError("Vajra AI returned an empty response. Please try again.")
    return reply


def _converse_stream_bedrock(
    messages: list[Message],
    *,
    system: str | None,
    max_tokens: int | None,
    temperature: float | None,
) -> Iterator[str]:
    client = _get_client()

    bedrock_messages = [
        {"role": m["role"], "content": [{"text": m["content"]}]}
        for m in messages
        if m.get("content")
    ]
    if not bedrock_messages:
        raise VajraAIError("No message content to send.")

    request: dict[str, Any] = {
        "modelId": settings.BEDROCK_MODEL_ID,
        "messages": bedrock_messages,
        "inferenceConfig": {
            "maxTokens": max_tokens or settings.BEDROCK_MAX_TOKENS,
            "temperature": settings.BEDROCK_TEMPERATURE
            if temperature is None
            else temperature,
        },
    }
    if system:
        request["system"] = [{"text": system}]

    try:
        with _call_lock:
            response = client.converse_stream(**request)

        for event in response.get("stream", []):
            if "contentBlockDelta" in event:
                delta = event["contentBlockDelta"]["delta"]
                if "text" in delta:
                    yield delta["text"]
    except Exception as exc:
        logger.exception("Vajra AI provider stream call failed")
        raise VajraAIError(_friendly_error(exc)) from exc



def _extract_text(response: dict) -> str:
    """Concatenate all text blocks from the response.

    Reasoning models (e.g. gpt-oss, DeepSeek R1, models with extended thinking)
    emit multiple content blocks: a ``reasoningContent`` block plus the final
    ``text`` block — so we can't just read ``content[0]``. We join every ``text``
    block, and fall back to the reasoning text if the model emitted only that.
    """
    try:
        blocks = response["output"]["message"]["content"]
    except (KeyError, TypeError):
        return ""

    text_parts: list[str] = []
    reasoning_parts: list[str] = []
    for block in blocks or []:
        if not isinstance(block, dict):
            continue
        if isinstance(block.get("text"), str):
            text_parts.append(block["text"])
        reasoning = (
            block.get("reasoningContent", {})
            .get("reasoningText", {})
            .get("text")
            if isinstance(block.get("reasoningContent"), dict)
            else None
        )
        if isinstance(reasoning, str):
            reasoning_parts.append(reasoning)

    combined = "".join(text_parts).strip()
    if combined:
        return combined
    return "".join(reasoning_parts).strip()


def _friendly_error(exc: Exception) -> str:
    """Map a provider exception to a generic message (never names the backend)."""
    lowered = str(exc).lower()
    if "could not connect" in lowered or "endpoint" in lowered:
        return "Could not reach the Vajra AI service. Please try again shortly."
    if "accessdenied" in lowered or "not authorized" in lowered:
        return (
            "Vajra AI is not permitted to run this request. Please contact your "
            "administrator to enable access."
        )
    # Credential/token problems must be checked before the generic "invalid"
    # branch — providers phrase a bad key as "...security token...is invalid".
    if (
        "unrecognizedclient" in lowered
        or "invalidclienttoken" in lowered
        or "security token" in lowered
        or "credential" in lowered
        or "signature" in lowered
    ):
        return (
            "Vajra AI credentials are invalid or inactive. Please contact your "
            "administrator."
        )
    if "throttl" in lowered or "too many requests" in lowered:
        return "Vajra AI is busy right now. Please try again in a moment."
    if "validationexception" in lowered or "model" in lowered:
        return "Vajra AI could not process this request. Please contact your administrator."
    if "unable to locate credentials" in lowered:
        return (
            "Vajra AI is not configured on the server. Please contact your administrator "
            "to set AWS Bedrock credentials."
        )
    if (
        "default credentials" in lowered
        or "reauthentication" in lowered
        or "application default credentials" in lowered
        or "could not automatically determine credentials" in lowered
    ):
        return (
            "Vajra AI credentials are invalid or inactive. Please contact your "
            "administrator."
        )
    if "permissiondenied" in lowered or "403" in lowered or "iam" in lowered:
        return (
            "Vajra AI is not permitted to run this request. Please contact your "
            "administrator to enable access."
        )
    return "Vajra AI is temporarily unavailable. Please try again."


def _is_retryable_model_error(exc: Exception) -> bool:
    """True when trying another model ID may succeed (access/model/region issues)."""
    lowered = str(exc).lower()
    if any(
        token in lowered
        for token in (
            "credential",
            "security token",
            "signature",
            "unrecognizedclient",
            "invalidclienttoken",
            "throttl",
            "too many requests",
        )
    ):
        return False
    return any(
        token in lowered
        for token in (
            "accessdenied",
            "not authorized",
            "validationexception",
            "resourcenotfound",
            "model",
            "inference profile",
        )
    )


# --- High-level helpers -----------------------------------------------------

_DPDPA_PERSONA = (
    "You are Vajra AI, the in-product compliance assistant for Vajra, a "
    "platform that helps Indian organisations comply with the Digital Personal "
    "Data Protection Act, 2023 (DPDPA) and its Rules.\n\n"
    "You have TWO areas of expertise:\n"
    "1. DPDPA Legal Knowledge — cite section numbers, explain obligations, draft templates.\n"
    "2. Platform Navigation — guide users step-by-step through Vajra features "
    "(consent notices, PII scanning, DSAR management, breach disclosure, etc.) using "
    "the PLATFORM DOCUMENTATION provided below.\n\n"
    "Rules:\n"
    "- When the user asks HOW to do something on the platform, use the PLATFORM "
    "DOCUMENTATION context to give specific, step-by-step instructions.\n"
    "- NEVER mention backend APIs, database tables, SQL queries, REST endpoints, "
    "FastAPI routers, or any internal architecture details.\n"
    "- If the documentation doesn't cover the question, say so honestly.\n"
    "- Be accurate, concise, and practical.\n"
    "- Ground answers in DPDPA where relevant, cite section numbers when you are "
    "confident, and never invent legal provisions.\n"
    "- Add a brief reminder to confirm legal language with a qualified DPO/counsel "
    "when giving legal advice."
)


def _get_rag_context(query: str, db: Any) -> str:
    """Retrieve relevant documentation chunks for the user's question.

    Returns a formatted string of the top-K matching chunks, or an empty
    string if RAG is unavailable.
    """
    try:
        from app.services.embedding_service import search_similar

        chunks = search_similar(query, db, top_k=settings.RAG_TOP_K)
        if not chunks:
            return ""

        parts: list[str] = []
        for chunk in chunks:
            parts.append(
                f"[Source: {chunk.source_file} > {chunk.section_title}]\n"
                f"{chunk.content}"
            )
        return "\n\n---\n\n".join(parts)
    except Exception:
        logger.warning("RAG context retrieval failed — proceeding without docs", exc_info=True)
        return ""


def _build_system_prompt(
    *,
    user_query: str | None = None,
    context: str | None = None,
    db: Any | None = None,
) -> str:
    """Assemble the full system prompt with optional RAG + workspace context."""
    system = _DPDPA_PERSONA

    # RAG: inject relevant platform documentation.
    if db is not None and user_query:
        rag = _get_rag_context(user_query, db)
        if rag:
            system += f"\n\n--- PLATFORM DOCUMENTATION ---\n{rag}"

    # Workspace live-data context.
    if context:
        system += f"\n\nWorkspace context the user has shared:\n{context}"

    return system


def chat(
    messages: list[Message],
    *,
    context: str | None = None,
    db: Any | None = None,
) -> str:
    """General Vajra AI chat (used by the Consent Copilot)."""
    last_user_msg = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"),
        None,
    )
    system = _build_system_prompt(
        user_query=last_user_msg, context=context, db=db,
    )
    return converse(messages, system=system, max_tokens=settings.ai_max_tokens)


def chat_stream(
    messages: list[Message],
    *,
    context: str | None = None,
    db: Any | None = None,
) -> Iterator[str]:
    """Yield general Vajra AI chat reply chunks (used by the Consent Copilot)."""
    last_user_msg = next(
        (m["content"] for m in reversed(messages) if m.get("role") == "user"),
        None,
    )
    system = _build_system_prompt(
        user_query=last_user_msg, context=context, db=db,
    )
    return converse_stream(messages, system=system, max_tokens=settings.ai_max_tokens)



def recommendations(
    *,
    topic: str,
    context: str | None = None,
    count: int = 4,
) -> list[str]:
    """Return a list of short, actionable recommendation bullets.

    Used by the purple Vajra AI recommendation cards (DPIA, RoPA, Breach).
    """
    instruction = (
        f"Produce {count} short, specific, actionable {topic} for the scenario "
        "below. Each item must be a single sentence, plain text (no markdown, no "
        "numbering). Respond with ONLY a JSON array of strings."
    )
    if context:
        instruction += f"\n\nScenario:\n{context}"

    raw = converse(
        [{"role": "user", "content": instruction}],
        system=_DPDPA_PERSONA,
        temperature=0.4,
    )
    return _parse_string_list(raw, fallback_limit=count)


def generate(
    *,
    task: str,
    context: str | None = None,
    max_tokens: int | None = None,
) -> str:
    """Generate free-text content (banner/notice copy, summaries, etc.)."""
    prompt = task
    if context:
        prompt += f"\n\nContext:\n{context}"
    return converse(
        [{"role": "user", "content": prompt}],
        system=_DPDPA_PERSONA,
        max_tokens=max_tokens,
        temperature=0.5,
    )


_ROPA_DISCOVERY_SYSTEM = (
    _DPDPA_PERSONA
    + "\n\nYou specialise in Records of Processing Activities (RoPA) under India's "
    "Digital Personal Data Protection Act, 2023 (DPDPA).\n"
    "Given an organization's data inventory, connected sources, PII findings, "
    "existing RoPA entries, vendors, and detected trackers, identify undocumented "
    "or under-documented processing activities.\n\n"
    "Respond with ONLY a JSON array. Each element must be an object with these keys:\n"
    '- "source_type": one of api, database, openapi, sdk, queue, job, etl, webhook, warehouse\n'
    '- "source_name": string (specific asset or source identifier)\n'
    '- "description": string (why this processing was inferred)\n'
    '- "suggested_title": string (concise RoPA activity title)\n'
    '- "suggested_description": string (processing purpose and scope)\n'
    '- "suggested_data_categories": array of strings\n'
    '- "suggested_lawful_basis": consent, contract, legal-obligation, legitimate-interest, or null\n'
    '- "suggested_recipient": string or null (third-party recipient if applicable)\n\n'
    "Rules:\n"
    "- Only suggest activities NOT already covered by existing RoPA entries.\n"
    "- Ground every suggestion in the provided context; do not invent systems.\n"
    "- Prioritise sensitive PII, cross-border flows, and missing lawful basis.\n"
    "- Return at most 10 suggestions. Return [] if nothing new is found."
)


def ropa_discovery_suggestions(
    *,
    context: str,
    max_suggestions: int = 10,
) -> list[dict[str, Any]]:
    """Infer RoPA processing-activity suggestions from an org context snapshot."""
    instruction = (
        f"Analyze the organization context below and produce up to {max_suggestions} "
        "RoPA auto-discovery suggestions as a JSON array of objects. "
        "Respond with ONLY the JSON array — no markdown, no explanation."
    )
    raw = converse(
        [{"role": "user", "content": f"{instruction}\n\n{context}"}],
        system=_ROPA_DISCOVERY_SYSTEM,
        temperature=0.2,
        max_tokens=4096,
    )
    return _parse_json_object_list(raw, fallback_limit=max_suggestions)


_POLICY_TYPE_LABELS: dict[str, str] = {
    "privacy": "Privacy Policy",
    "cookie": "Cookie Policy",
    "children": "Children's Privacy Notice",
    "employee": "Employee Data Protection Policy",
    "retention": "Data Retention & Erasure Schedule",
    "incident": "Incident Response Plan",
    "vendor": "Vendor Data Processing Agreement",
    "aup": "Acceptable Use Policy",
    "custom": "Governance Policy",
}


_POLICY_FROM_ROPA_SYSTEM = (
    _DPDPA_PERSONA
    + "\n\nYou draft corporate governance policies for Indian organisations under the "
    "Digital Personal Data Protection Act, 2023 (DPDPA) and its Rules.\n"
    "Given a Record of Processing Activities (RoPA), produce a complete policy document.\n\n"
    "Respond with ONLY a JSON object with these keys:\n"
    '- "title": string (policy document title)\n'
    '- "summary": string (one-sentence changelog summary for the version)\n'
    '- "content": string (full policy body in markdown)\n\n'
    "The policy MUST include, where applicable from the RoPA data:\n"
    "1. Introduction and scope\n"
    "2. Categories of personal data processed\n"
    "3. Purposes and lawful bases (cite DPDPA sections where confident)\n"
    "4. Data principals' rights (access, correction, erasure, grievance)\n"
    "5. Third-party recipients and cross-border transfers\n"
    "6. Retention and erasure schedules\n"
    "7. Security safeguards overview\n"
    "8. DPO / grievance officer contact placeholder\n"
    "9. Children's data handling (if RoPA includes children)\n\n"
    "Use professional legal tone. Do not invent processing activities not in the RoPA. "
    "Add a footer reminding the organisation to review with qualified counsel."
)


def generate_policy_from_ropa(
    *,
    context: str,
    org_name: str,
    policy_type: str = "privacy",
) -> dict[str, str]:
    """Draft a policy document from RoPA context via the active AI provider."""
    label = _POLICY_TYPE_LABELS.get(policy_type, "Privacy Policy")
    instruction = (
        f'Draft a DPDPA-compliant "{label}" for "{org_name}" based on the RoPA below. '
        "Respond with ONLY the JSON object — no markdown wrapper, no explanation."
    )
    raw = converse(
        [{"role": "user", "content": f"{instruction}\n\n{context}"}],
        system=_POLICY_FROM_ROPA_SYSTEM,
        temperature=0.3,
        max_tokens=6000,
    )
    parsed = _parse_json_object(raw)
    if not parsed.get("content"):
        raise VajraAIError("Vajra AI returned an empty policy draft.")
    return {
        "title": str(parsed.get("title") or label).strip(),
        "summary": str(parsed.get("summary") or f"Vajra AI draft generated from RoPA for {org_name}.").strip(),
        "content": str(parsed["content"]).strip(),
    }


def _parse_json_object(raw: str) -> dict[str, Any]:
    """Best-effort extraction of a JSON object from a model response."""
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    return {}


def _parse_json_object_list(raw: str, *, fallback_limit: int) -> list[dict[str, Any]]:
    """Best-effort extraction of a list of dicts from a model response."""
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                items = [x for x in parsed if isinstance(x, dict)]
                if items:
                    return items[:fallback_limit]
        except json.JSONDecodeError:
            pass
    return []


def _parse_string_list(raw: str, *, fallback_limit: int) -> list[str]:
    """Best-effort extraction of a list of strings from a model response."""
    # 1. Try to find a JSON array anywhere in the text.
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, list):
                items = [str(x).strip() for x in parsed if str(x).strip()]
                if items:
                    return items[:fallback_limit]
        except json.JSONDecodeError:
            pass

    # 2. Fall back to splitting lines and stripping bullet/number prefixes.
    lines = []
    for line in raw.splitlines():
        cleaned = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip()
        if cleaned:
            lines.append(cleaned)
    return lines[:fallback_limit]


def chunk_text(text: str, chunk_size: int = 600, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks of chunk_size characters."""
    if len(text) <= chunk_size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start += chunk_size - overlap
    return chunks


def retrieve_relevant_chunks(document_text: str, queries: list[str], top_k_per_query: int = 2) -> str:
    """Retrieve relevant chunks from a document using local Titan embeddings and dot product."""
    from app.services.embedding_service import embed_text, embed_batch

    chunks = chunk_text(document_text)
    if not chunks:
        return ""

    try:
        # Embed all chunks
        chunk_embeddings = embed_batch(chunks, delay=0.01)
    except Exception as exc:
        logger.warning("Failed to embed document chunks for local RAG, falling back to full text: %s", exc)
        return document_text[:4000]

    retrieved_chunk_indices = set()
    for query in queries:
        try:
            query_emb = embed_text(query, task_type="RETRIEVAL_QUERY")
            # Compute dot product (cosine similarity since Titan embeddings are normalized)
            scores = []
            for idx, chunk_emb in enumerate(chunk_embeddings):
                sim = sum(a * b for a, b in zip(query_emb, chunk_emb))
                scores.append((sim, idx))
            scores.sort(key=lambda x: x[0], reverse=True)
            for _, idx in scores[:top_k_per_query]:
                retrieved_chunk_indices.add(idx)
        except Exception as exc:
            logger.warning("Failed to embed query '%s' for local RAG: %s", query, exc)
            continue

    # Reconstruct context sorted by appearance in document
    sorted_indices = sorted(list(retrieved_chunk_indices))
    selected_chunks = [chunks[idx] for idx in sorted_indices]
    return "\n\n---\n\n".join(selected_chunks)


def draft_consent_notice_from_context(*, context: str, language: str = "English") -> dict[str, str]:
    """Generate DPDPA consent notice draft using the active AI provider."""
    system_prompt = (
        "You are Vajra AI, the DPDPA compliance assistant.\n"
        "Your task is to draft a structured, comprehensive DPDPA-compliant consent notice based on the provided document context.\n\n"
        "Generate a JSON object with EXACTLY the following keys:\n"
        '- "notice_title": a short internal name for the consent notice (e.g. "Employee Consent Notice")\n'
        '- "display_name": user-facing notice title (e.g. "Notice of Personal Data Collection")\n'
        '- "language": the language of the notice (default "English")\n'
        '- "opening_statement": introductory statement explaining that data is collected and why, in DPDPA compliant language\n'
        '- "contact_email": contact email address for privacy queries\n'
        '- "contact_website": contact website URL\n'
        '- "dpo_name": name of the Data Protection Officer / Grievance Officer\n'
        '- "dpo_email": email address of the DPO / Grievance Officer\n'
        '- "rights_exercise": description of how users can exercise their rights under DPDPA (e.g. access, correction, erasure, withdrawal)\n'
        '- "complaint_process": explanation of the grievance redressal mechanism and right to complain to the DPBI (Data Protection Board of India)\n'
        '- "retention_policy": description of the data retention period and policy (e.g. "We retain data for 3 years or until account deletion")\n\n'
        "Rules:\n"
        "- Respond with ONLY the JSON object. Do not wrap in markdown ```json blocks. Do not explain your output.\n"
        "- Strictly output in the requested language (which is English unless specified otherwise).\n"
        "- Ensure the email fields match standard email formats if present in the text, or leave empty/null if none found.\n"
        "- The complaint process must cite the right of data principal to make a complaint to the Data Protection Board of India (DPBI) as required under DPDPA Section 6.\n"
        "- The rights exercise must explain how to withdraw consent as required under DPDPA Section 6.\n"
        "- Do not make up DPO info if not in the context, but fill in placeholders like '[Insert DPO Name]' if it is not specified so the user can edit it."
    )

    prompt = f"Draft a DPDPA consent notice based on the following text context:\n\n{context}"

    raw = converse(
        [{"role": "user", "content": prompt}],
        system=system_prompt,
        temperature=0.3,
        max_tokens=2048,
    )

    parsed = _parse_json_object(raw)
    return parsed


def draft_consent_notice_from_questions(
    *,
    org_name: str,
    industry: str,
    data_types: str,
    dpo_name: str,
    dpo_email: str,
    retention_period: str,
    purpose: str,
    language: str = "English",
) -> dict[str, str]:
    """Draft a DPDPA consent notice from user questions using the active AI provider."""
    context = (
        f"Organisation Name: {org_name}\n"
        f"Industry / Sector: {industry}\n"
        f"Types of Personal Data Collected: {data_types}\n"
        f"Data Retention Period: {retention_period}\n"
        f"DPO / Grievance Officer Name: {dpo_name}\n"
        f"DPO / Grievance Officer Email: {dpo_email}\n"
        f"Primary Purpose of Data Collection: {purpose}\n"
    )
    return draft_consent_notice_from_context(context=context, language=language)

