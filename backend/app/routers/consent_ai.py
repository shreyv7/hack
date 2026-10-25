import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, status
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.vajra_ai import ConsentDraftResult, ConsentDraftFromQuestionsRequest
from app.services import vajra_ai_service
from app.services.file_scanner import parse_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai/consent", tags=["consent-ai"])

MAX_UPLOAD_SIZE = 500 * 1024  # 500 KB
CHARACTER_LIMIT = 8000


@router.post("/draft-from-upload", response_model=ConsentDraftResult)
async def draft_from_upload(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> ConsentDraftResult:
    """Extract text from an uploaded consent document, perform ephemeral RAG, and draft a consent notice."""
    # Check file size limit
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 500 KB limit.",
        )

    # Reset uploader stream
    await file.seek(0)

    try:
        parsed = parse_bytes(content, file.filename)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Failed to parse file for consent draft RAG")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading document content.",
        ) from exc

    text = parsed.text or ""
    if not text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No readable text found in the uploaded document.",
        )

    # Truncate text content to character limit
    text = text[:CHARACTER_LIMIT]

    # Perform local ephemeral RAG
    queries = [
        "Identity of data fiduciary, organization name, contact info, website, email",
        "Purpose of data collection, opening statement, data categories, retention period",
        "DPO name, DPO email, Grievance redressal officer",
        "Rights exercise, withdraw consent, complaint process, DPBI",
    ]

    # Retrieve relevant chunks from the uploaded document
    context = vajra_ai_service.retrieve_relevant_chunks(text, queries, top_k_per_query=2)
    if not context:
        context = text[:4000]  # fallback to first 4k characters if RAG retrieval returns nothing

    try:
        draft = vajra_ai_service.draft_consent_notice_from_context(context=context)
        return ConsentDraftResult(**draft)
    except Exception as exc:
        logger.exception("Vajra AI drafting failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc) or "Vajra AI could not process this request.",
        ) from exc


@router.post("/draft-from-questions", response_model=ConsentDraftResult)
def draft_from_questions(
    payload: ConsentDraftFromQuestionsRequest,
    current_user: User = Depends(get_current_user),
) -> ConsentDraftResult:
    """Synthesize answers from guided questions into a draft consent notice."""
    try:
        draft = vajra_ai_service.draft_consent_notice_from_questions(
            org_name=payload.org_name,
            industry=payload.industry,
            data_types=payload.data_types,
            dpo_name=payload.dpo_name,
            dpo_email=payload.dpo_email,
            retention_period=payload.retention_period,
            purpose=payload.purpose,
            language=payload.language or "English",
        )
        return ConsentDraftResult(**draft)
    except Exception as exc:
        logger.exception("Vajra AI drafting failed")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc) or "Vajra AI could not process this request.",
        ) from exc
