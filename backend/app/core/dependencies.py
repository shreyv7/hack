"""
Shared FastAPI dependencies — database session, auth, and role checks.
"""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_token
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole, UserStatus

bearer_scheme = HTTPBearer(auto_error=False)

# Endpoints a "restricted" user (must-change-password or pending-approval) may
# still reach: they only touch the user's own account, never app data.
SELF_SERVICE_PATH_SUFFIXES = (
    "/auth/me",
    "/auth/logout",
    "/auth/change-password",
)


def _self_service_path_allowed(request: Request) -> bool:
    path = request.url.path.rstrip("/")
    for suffix in SELF_SERVICE_PATH_SUFFIXES:
        allowed = f"{settings.API_V1_PREFIX}{suffix}".rstrip("/")
        if path == allowed or path.endswith(suffix):
            return True
    return False


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_token(credentials.credentials)
    if payload is None or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, UUID(user_id))
    if user is None or user.status == UserStatus.disabled:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.organization_id is not None:
        org = db.get(Organization, user.organization_id)
        if org is None or org.status == OrganizationStatus.suspended:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Organization is suspended")

    # Gate restricted accounts out of the app until they're cleared. They may
    # still call the self-service endpoints (/auth/me, /auth/logout, etc.).
    if not _self_service_path_allowed(request):
        if user.must_change_password:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Password change required")
        if user.status == UserStatus.pending_approval:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, detail="Account pending superadmin approval"
            )

    # Auditor role: read-only except self-service auth endpoints.
    if (
        user.role == UserRole.auditor
        and request.method.upper() not in ("GET", "HEAD", "OPTIONS")
        and not _self_service_path_allowed(request)
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Auditor role is read-only")

    return user


def require_role(*roles: UserRole) -> Callable[..., User]:
    """Dependency factory: current user must have one of the given roles."""

    def _checker(user: Annotated[User, Depends(get_current_user)]) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _checker
