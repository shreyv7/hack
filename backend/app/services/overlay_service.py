"""Org-scoped team comments for the floating assistant overlay."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.models.overlay import OverlayComment
from app.models.user import User, UserRole
from app.schemas.overlay import CommentCreate, CommentRead


class OverlayCommentService:
    def __init__(self, db: Session):
        self.db = db

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        if user.role == UserRole.superadmin:
            if org_id is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    detail="Comments require an organization context",
                )
            return org_id
        if user.organization_id is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                detail="Comments require an organization context",
            )
        if org_id is not None and org_id != user.organization_id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization not found")
        return user.organization_id

    def _author_name(self, user: User) -> str:
        if user.full_name:
            return user.full_name
        return user.email or str(user.id)

    def _serialize(self, comment: OverlayComment) -> CommentRead:
        author = comment.author
        author_name = self._author_name(author) if author else "Unknown"
        return CommentRead(
            id=comment.id,
            organization_id=comment.organization_id,
            user_id=comment.user_id,
            author_name=author_name,
            body=comment.body,
            created_at=comment.created_at,
        )

    def list_comments(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        limit: int = 200,
    ) -> list[CommentRead]:
        resolved = self._resolve_org_id(user, org_id)
        rows = (
            self.db.execute(
                select(OverlayComment)
                .options(joinedload(OverlayComment.author))
                .where(OverlayComment.organization_id == resolved)
                .order_by(OverlayComment.created_at.asc())
                .limit(limit)
            )
            .scalars()
            .unique()
            .all()
        )
        return [self._serialize(r) for r in rows]

    def create_comment(
        self,
        user: User,
        body: CommentCreate,
        *,
        org_id: UUID | None = None,
    ) -> CommentRead:
        resolved = self._resolve_org_id(user, org_id)
        comment = OverlayComment(
            organization_id=resolved,
            user_id=user.id,
            body=body.body.strip(),
        )
        self.db.add(comment)
        self.db.commit()
        self.db.refresh(comment)
        comment.author = user
        return self._serialize(comment)

    def delete_comment(
        self,
        user: User,
        comment_id: UUID,
        *,
        org_id: UUID | None = None,
    ) -> None:
        resolved = self._resolve_org_id(user, org_id)
        comment = self.db.get(OverlayComment, comment_id)
        if comment is None or comment.organization_id != resolved:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Comment not found")

        is_owner = comment.user_id == user.id
        is_admin = user.role in (UserRole.admin, UserRole.superadmin)
        if not is_owner and not is_admin:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

        self.db.delete(comment)
        self.db.commit()
