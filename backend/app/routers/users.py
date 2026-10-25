from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import require_role, get_current_user
from app.core.rbac import Permission, has_permission, require_permission
from app.models.user import User, UserRole
from app.models.notice_delivery import UserNotification
from app.schemas.user import (
    RoleRead,
    UserInvite,
    UserRead,
    UserScopeAssignmentCreate,
    UserScopeAssignmentRead,
    UserUpdate,
    build_role_catalog,
)
from app.schemas.notice_delivery import UserNotificationRead, UserNotificationUnreadCount
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/roles", response_model=list[RoleRead])
def list_roles(
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[RoleRead]:
    return build_role_catalog()


@router.get("", response_model=list[UserRead])
def list_users(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    role: UserRole | None = Query(default=None),
) -> list[User]:
    can_manage = has_permission(current_user, Permission.USER_MANAGE)
    can_pick_assignees = has_permission(current_user, Permission.DSAR_ASSIGN) or has_permission(
        current_user, Permission.TASK_ASSIGN
    ) or has_permission(current_user, Permission.BREACH_TRIAGE)
    if not can_manage and not (role is not None and can_pick_assignees):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    return UserService(db).list_users(current_user, org_id=org_id, role=role)


@router.post("/invite", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def invite_user(
    body: UserInvite,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> User:
    return UserService(db).invite(current_user, body, org_id=org_id)


@router.patch("/{user_id}", response_model=UserRead)
def update_user(
    user_id: UUID,
    body: UserUpdate,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> User:
    return UserService(db).update_user(current_user, user_id, body)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_user(
    user_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> Response:
    UserService(db).delete_user(current_user, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{user_id}/resend-invite", response_model=UserRead)
def resend_invite(
    user_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> User:
    return UserService(db).resend_invite(current_user, user_id)


@router.get("/{user_id}/scopes", response_model=list[UserScopeAssignmentRead])
def list_user_scopes(
    user_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> list:
    return UserService(db).list_scope_assignments(current_user, user_id)


@router.post(
    "/{user_id}/scopes",
    response_model=UserScopeAssignmentRead,
    status_code=status.HTTP_201_CREATED,
)
def add_user_scope(
    user_id: UUID,
    body: UserScopeAssignmentCreate,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> object:
    return UserService(db).add_scope_assignment(current_user, user_id, body)


@router.delete("/{user_id}/scopes/{scope_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_scope(
    user_id: UUID,
    scope_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.USER_MANAGE))],
    db: Session = Depends(get_db),
) -> Response:
    UserService(db).remove_scope_assignment(current_user, user_id, scope_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me/notifications/unread-count", response_model=UserNotificationUnreadCount)
def get_my_notifications_unread_count(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> UserNotificationUnreadCount:
    if current_user.organization_id is None:
        return UserNotificationUnreadCount(unread_count=0)
    count = (
        db.query(UserNotification)
        .filter(
            UserNotification.organization_id == current_user.organization_id,
            UserNotification.recipient_id == str(current_user.id),
            UserNotification.is_read == False,
        )
        .count()
    )
    return UserNotificationUnreadCount(unread_count=count)


@router.get("/me/notifications", response_model=list[UserNotificationRead])
def get_my_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    limit: int = Query(default=30, ge=1, le=100),
    unread_only: bool = Query(default=False),
) -> list[UserNotification]:
    if current_user.organization_id is None:
        return []
    query = db.query(UserNotification).filter(
        UserNotification.organization_id == current_user.organization_id,
        UserNotification.recipient_id == str(current_user.id),
    )
    if unread_only:
        query = query.filter(UserNotification.is_read == False)
    notifications = (
        query.order_by(UserNotification.created_at.desc()).limit(limit).all()
    )
    return notifications


@router.patch("/me/notifications/{notification_id}/read", response_model=UserNotificationRead)
def mark_notification_read(
    notification_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> UserNotification:
    if current_user.organization_id is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification = (
        db.query(UserNotification)
        .filter(
            UserNotification.id == notification_id,
            UserNotification.organization_id == current_user.organization_id,
            UserNotification.recipient_id == str(current_user.id),
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
        
    notification.is_read = True
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


@router.post("/me/notifications/read-all", status_code=status.HTTP_200_OK)
def mark_all_notifications_read(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
):
    if current_user.organization_id is None:
        return {"detail": "All notifications marked as read"}
    db.query(UserNotification).filter(
        UserNotification.organization_id == current_user.organization_id,
        UserNotification.recipient_id == str(current_user.id),
        UserNotification.is_read == False,
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
    return {"detail": "All notifications marked as read"}
