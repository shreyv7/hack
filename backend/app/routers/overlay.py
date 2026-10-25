"""Floating assistant overlay — team comments and Shield AI Vision."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.overlay import CommentCreate, CommentRead, VisionQueryRequest, VisionQueryResponse
from app.services.overlay_service import OverlayCommentService
from app.services.shield_ai_service import ShieldAIError
from app.services.vision_assist_service import VisionAssistService

router = APIRouter(prefix="/overlay", tags=["overlay"])


@router.get("/comments", response_model=list[CommentRead])
def list_comments(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
) -> list[CommentRead]:
    return OverlayCommentService(db).list_comments(current_user, org_id=org_id, limit=limit)


@router.post("/comments", response_model=CommentRead, status_code=201)
def create_comment(
    body: CommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CommentRead:
    return OverlayCommentService(db).create_comment(current_user, body, org_id=org_id)


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(
    comment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    OverlayCommentService(db).delete_comment(current_user, comment_id, org_id=org_id)


@router.post("/vision-query", response_model=VisionQueryResponse)
def vision_query(
    body: VisionQueryRequest,
    current_user: Annotated[User, Depends(get_current_user)],
) -> VisionQueryResponse:
    """Ephemeral vision Q&A — image and question are not persisted."""
    del current_user  # auth gate only — any authenticated user may use vision
    try:
        answer = VisionAssistService().answer(body.image_base64, body.question)
    except ShieldAIError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return VisionQueryResponse(answer=answer)
