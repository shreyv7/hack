"""Central in-app notification service — org-scoped, RBAC-aware."""

from __future__ import annotations

import enum
from uuid import UUID

from sqlalchemy.orm import Session

from app.core.rbac import Permission, has_permission, list_users_by_role
from app.models.notice_delivery import UserNotification
from app.models.user import User, UserRole, UserStatus


class NotificationCategory(str, enum.Enum):
    system = "system"
    dsar = "dsar"
    breach = "breach"
    consent = "consent"
    ropa = "ropa"
    approval = "approval"


class NotificationSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


def create_notification(
    db: Session,
    *,
    organization_id: UUID,
    recipient_id: UUID | str,
    title: str,
    message: str,
    category: NotificationCategory = NotificationCategory.system,
    action_url: str | None = None,
    severity: NotificationSeverity = NotificationSeverity.info,
) -> UserNotification:
    notification = UserNotification(
        organization_id=organization_id,
        recipient_id=str(recipient_id),
        title=title,
        message=message,
        category=category.value,
        action_url=action_url,
        severity=severity.value,
        is_read=False,
    )
    db.add(notification)
    return notification


def notify_user(
    db: Session,
    user: User,
    *,
    title: str,
    message: str,
    category: NotificationCategory = NotificationCategory.system,
    action_url: str | None = None,
    severity: NotificationSeverity = NotificationSeverity.info,
) -> UserNotification | None:
    if user.organization_id is None or user.status != UserStatus.active:
        return None
    return create_notification(
        db,
        organization_id=user.organization_id,
        recipient_id=user.id,
        title=title,
        message=message,
        category=category,
        action_url=action_url,
        severity=severity,
    )


def notify_user_by_id(
    db: Session,
    organization_id: UUID,
    recipient_id: UUID,
    *,
    title: str,
    message: str,
    category: NotificationCategory = NotificationCategory.system,
    action_url: str | None = None,
    severity: NotificationSeverity = NotificationSeverity.info,
    exclude_user_id: UUID | None = None,
) -> UserNotification | None:
    if exclude_user_id is not None and recipient_id == exclude_user_id:
        return None
    user = db.get(User, recipient_id)
    if user is None or user.organization_id != organization_id or user.status != UserStatus.active:
        return None
    return create_notification(
        db,
        organization_id=organization_id,
        recipient_id=recipient_id,
        title=title,
        message=message,
        category=category,
        action_url=action_url,
        severity=severity,
    )


def _active_org_users(db: Session, organization_id: UUID) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.organization_id == organization_id,
            User.status == UserStatus.active,
            User.role != UserRole.superadmin,
        )
        .all()
    )


def notify_users_with_permission(
    db: Session,
    organization_id: UUID,
    permission: Permission,
    *,
    title: str,
    message: str,
    category: NotificationCategory = NotificationCategory.system,
    action_url: str | None = None,
    severity: NotificationSeverity = NotificationSeverity.info,
    exclude_user_id: UUID | None = None,
) -> list[UserNotification]:
    sent: list[UserNotification] = []
    for user in _active_org_users(db, organization_id):
        if exclude_user_id is not None and user.id == exclude_user_id:
            continue
        if has_permission(user, permission):
            sent.append(
                create_notification(
                    db,
                    organization_id=organization_id,
                    recipient_id=user.id,
                    title=title,
                    message=message,
                    category=category,
                    action_url=action_url,
                    severity=severity,
                )
            )
    return sent


def notify_users_by_roles(
    db: Session,
    organization_id: UUID,
    roles: list[UserRole],
    *,
    title: str,
    message: str,
    category: NotificationCategory = NotificationCategory.system,
    action_url: str | None = None,
    severity: NotificationSeverity = NotificationSeverity.info,
    exclude_user_id: UUID | None = None,
) -> list[UserNotification]:
    seen: set[UUID] = set()
    sent: list[UserNotification] = []
    for role in roles:
        for user in list_users_by_role(db, organization_id, role):
            if user.id in seen:
                continue
            if exclude_user_id is not None and user.id == exclude_user_id:
                continue
            seen.add(user.id)
            sent.append(
                create_notification(
                    db,
                    organization_id=organization_id,
                    recipient_id=user.id,
                    title=title,
                    message=message,
                    category=category,
                    action_url=action_url,
                    severity=severity,
                )
            )
    return sent


def list_users_with_any_permission(
    db: Session,
    organization_id: UUID,
    *permissions: Permission,
) -> list[User]:
    result: list[User] = []
    seen: set[UUID] = set()
    for user in _active_org_users(db, organization_id):
        if user.id in seen:
            continue
        if any(has_permission(user, p) for p in permissions):
            seen.add(user.id)
            result.append(user)
    return result
