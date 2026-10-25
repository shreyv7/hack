"""
Public, API-key-authenticated retention-obligation API (Stage 4).

The org's own application drives application-level erasure:
  * POST /events      — report a lifecycle event (consent withdrawal, etc.),
                        which creates/refreshes an erasure obligation.
  * GET  /due         — poll for obligations whose erasure is now due, then purge
                        them at the app level (its own FK graph, caches, backups).
  * POST /obligations/{id}/fulfill — confirm the purge; evidence is stored.

Authenticated with an integration API key in the `X-Api-Key` header (same scheme
as the Children's Data enforcement API), so machine-to-machine callers can use it.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import verify_password
from app.models.integration_api_key import IntegrationApiKey
from app.schemas.retention import (
    DueObligation,
    ObligationEventRequest,
    ObligationEventResult,
    ObligationFulfill,
    ObligationRead,
)
from app.services.retention_obligation_service import RetentionObligationService

router = APIRouter(prefix="/public/v1/retention", tags=["retention-public"])


def org_from_api_key(
    x_api_key: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
) -> UUID:
    """Resolve an organization from an X-Api-Key header (any active key for the org)."""
    if not x_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Missing API Key")
    prefix = x_api_key[:13]
    api_key_obj = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.key_prefix == prefix, IntegrationApiKey.status == "active")
        .first()
    )
    valid_full = bool(api_key_obj and verify_password(x_api_key, api_key_obj.key_hash))
    valid_dev = bool(
        api_key_obj
        and settings.ENVIRONMENT == "development"
        and x_api_key == api_key_obj.key_prefix
    )
    if not api_key_obj or not (valid_full or valid_dev):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Invalid API Key")
    api_key_obj.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return api_key_obj.organization_id


@router.post("/events", response_model=ObligationEventResult)
def report_event(
    body: ObligationEventRequest,
    org_id: Annotated[UUID, Depends(org_from_api_key)],
    db: Session = Depends(get_db),
) -> ObligationEventResult:
    """Report a lifecycle event → create/refresh an erasure obligation."""
    obligation, created = RetentionObligationService(db).record_event(org_id, body)
    message = (
        f"Obligation created — erasure due {obligation.due_at.date().isoformat()}."
        if created
        else f"Obligation updated — erasure due {obligation.due_at.date().isoformat()}."
    )
    return ObligationEventResult(obligation=obligation, created=created, message=message)


@router.get("/due", response_model=list[DueObligation])
def list_due(
    org_id: Annotated[UUID, Depends(org_from_api_key)],
    db: Session = Depends(get_db),
) -> list[DueObligation]:
    """Obligations whose erasure is due now. Purge these in your systems, then
    call the fulfill endpoint for each."""
    return RetentionObligationService(db).list_due_for_org(org_id)


@router.post("/obligations/{obligation_id}/fulfill", response_model=ObligationRead)
def fulfill(
    obligation_id: UUID,
    body: ObligationFulfill,
    org_id: Annotated[UUID, Depends(org_from_api_key)],
    db: Session = Depends(get_db),
) -> ObligationRead:
    """Confirm your app has purged the subject; evidence is recorded for audit."""
    return RetentionObligationService(db).fulfill_for_org(
        org_id, obligation_id, body, by="api"
    )
