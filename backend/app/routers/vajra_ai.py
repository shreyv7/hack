"""Vajra AI endpoints — provider-agnostic assistant (Vertex or Bedrock)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.vajra_ai import (
    ChatRequest,
    ChatResponse,
    ContextItemRead,
    ContextResponse,
    ConversationCreate,
    ConversationDetail,
    ConversationRename,
    ConversationSummary,
    GenerateRequest,
    GenerateResponse,
    RecommendationsRequest,
    RecommendationsResponse,
    SendMessageRequest,
    StatusResponse,
)
from app.services import vajra_ai_service
from app.services.ai_context_service import AiContextService
from app.services.ai_conversation_service import AiConversationService
from app.services.vajra_ai_service import VajraAIError

router = APIRouter(prefix="/ai", tags=["vajra-ai"])


def _handle(call):
    """Run a Vajra AI service call, mapping failures to HTTP errors."""
    try:
        return call()
    except VajraAIError as exc:
        # 503: the feature is unconfigured or the AI provider is unreachable — a server-
        # side condition the caller can't fix by changing the request body.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc


@router.get("/status", response_model=StatusResponse)
def vajra_ai_status(
    _current_user: Annotated[User, Depends(get_current_user)],
) -> StatusResponse:
    """Report whether Vajra AI is configured (so the UI can degrade gracefully)."""
    configured = settings.ai_configured
    return StatusResponse(
        configured=configured,
        provider=settings.ai_provider if configured else None,
        model_id=settings.ai_model_id or None,
        region=settings.ai_region if configured else None,
    )


@router.post("/chat", response_model=ChatResponse)
def vajra_ai_chat(
    payload: ChatRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
) -> ChatResponse:
    reply = _handle(
        lambda: vajra_ai_service.chat(
            [m.model_dump() for m in payload.messages],
            context=payload.context,
        )
    )
    return ChatResponse(reply=reply)


@router.post("/recommendations", response_model=RecommendationsResponse)
def vajra_ai_recommendations(
    payload: RecommendationsRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
) -> RecommendationsResponse:
    suggestions = _handle(
        lambda: vajra_ai_service.recommendations(
            topic=payload.topic,
            context=payload.context,
            count=payload.count,
        )
    )
    return RecommendationsResponse(suggestions=suggestions)


@router.post("/generate", response_model=GenerateResponse)
def vajra_ai_generate(
    payload: GenerateRequest,
    _current_user: Annotated[User, Depends(get_current_user)],
) -> GenerateResponse:
    text = _handle(
        lambda: vajra_ai_service.generate(
            task=payload.task,
            context=payload.context,
            max_tokens=payload.max_tokens,
        )
    )
    return GenerateResponse(text=text)


# --- Workspace context -------------------------------------------------------


@router.get("/context", response_model=ContextResponse)
def vajra_ai_context(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ContextResponse:
    """Real 'Current data access' snapshot for the context panel."""
    items = AiContextService(db).get_context(current_user, org_id=org_id)
    return ContextResponse(
        items=[ContextItemRead(id=i.id, label=i.label, value=i.value) for i in items]
    )


# --- Persisted conversations -------------------------------------------------


@router.get("/conversations", response_model=list[ConversationSummary])
def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ConversationSummary]:
    convs = AiConversationService(db).list_conversations(current_user, org_id=org_id)
    return [ConversationSummary.model_validate(c) for c in convs]


@router.post("/conversations", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
def create_conversation(
    payload: ConversationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConversationDetail:
    conv = AiConversationService(db).create_conversation(
        current_user, org_id=org_id, title=payload.title
    )
    return ConversationDetail.model_validate(conv)


@router.get("/conversations/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConversationDetail:
    conv = AiConversationService(db).get_conversation(
        current_user, conversation_id, org_id=org_id
    )
    return ConversationDetail.model_validate(conv)


@router.patch("/conversations/{conversation_id}", response_model=ConversationDetail)
def rename_conversation(
    conversation_id: UUID,
    payload: ConversationRename,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConversationDetail:
    conv = AiConversationService(db).rename_conversation(
        current_user, conversation_id, payload.title, org_id=org_id
    )
    return ConversationDetail.model_validate(conv)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(
    conversation_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    AiConversationService(db).delete_conversation(
        current_user, conversation_id, org_id=org_id
    )


@router.post("/conversations/{conversation_id}/messages", response_model=ConversationDetail)
def send_message(
    conversation_id: UUID,
    payload: SendMessageRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConversationDetail:
    conv = _handle(
        lambda: AiConversationService(db).send_message(
            current_user,
            conversation_id,
            payload.content,
            use_company_data=payload.use_company_data,
            org_id=org_id,
        )
    )
    return ConversationDetail.model_validate(conv)


@router.post("/conversations/{conversation_id}/messages/stream")
def send_message_stream(
    conversation_id: UUID,
    payload: SendMessageRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> StreamingResponse:
    import json
    def event_generator():
        try:
            svc = AiConversationService(db)
            for chunk in svc.send_message_stream(
                current_user,
                conversation_id,
                payload.content,
                use_company_data=payload.use_company_data,
                org_id=org_id,
            ):
                yield f"data: {json.dumps({'type': 'content', 'delta': chunk})}\n\n"
            
            conv = svc.get_conversation(current_user, conversation_id, org_id=org_id)
            conv_detail = ConversationDetail.model_validate(conv)
            yield f"data: {json.dumps({'type': 'done', 'conversation': conv_detail.model_dump(mode='json')})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'detail': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# --- Admin: RAG document re-indexing -----------------------------------------


@router.post("/admin/reindex-docs", status_code=status.HTTP_202_ACCEPTED)
def reindex_docs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> dict:
    """Trigger a full re-index of platform documentation for Vajra AI RAG.

    Reads all Markdown files in the ``docs/`` folder, strips backend-only
    sections, chunks the remaining user-facing content, embeds via the
    active AI provider, and upserts into the ``doc_embeddings`` table.

    Only users with the ``superadmin`` role may call this endpoint.
    """
    if not getattr(current_user, "is_superadmin", False) and getattr(
        current_user, "role", ""
    ) != "superadmin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins may trigger a documentation re-index.",
        )

    from app.services.doc_ingestion_service import DocIngestionService

    stats = DocIngestionService(db).ingest_all()
    return {"status": "completed", **stats}

