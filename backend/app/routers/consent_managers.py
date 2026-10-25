from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.consent_manager import ConsentManagerRead, ConsentManagerCreate, ConsentSyncPayload
from app.services.consent_manager_service import ConsentManagerService

router = APIRouter(prefix="/consent-managers", tags=["Consent Managers"])


@router.get("", response_model=list[ConsentManagerRead])
def list_consent_managers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ConsentManagerRead]:
    return ConsentManagerService(db).list_connections(current_user, org_id=org_id)


@router.post("", response_model=ConsentManagerRead)
def connect_consent_manager(
    body: ConsentManagerCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentManagerRead:
    return ConsentManagerService(db).connect(current_user, body, org_id=org_id)


@router.post("/{conn_id}/disconnect", response_model=ConsentManagerRead)
def disconnect_consent_manager(
    conn_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentManagerRead:
    return ConsentManagerService(db).disconnect(current_user, conn_id, org_id=org_id)


@router.post("/{conn_id}/sync", response_model=dict)
async def sync_consent(
    conn_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
    x_webhook_signature: str | None = Header(default=None, alias="X-Webhook-Signature"),
    x_webhook_timestamp: str | None = Header(default=None, alias="X-Webhook-Timestamp"),
    x_webhook_event_id: str | None = Header(default=None, alias="X-Webhook-Event-Id"),
) -> dict:
    """Webhook receiver with HMAC signature, replay protection, and audit logging."""
    raw_body = await request.body()
    payload = ConsentSyncPayload.model_validate_json(raw_body)
    return ConsentManagerService(db).sync_consent(
        conn_id,
        payload,
        raw_body=raw_body,
        signature_header=x_webhook_signature,
        timestamp_header=x_webhook_timestamp,
        event_id=x_webhook_event_id,
    )
