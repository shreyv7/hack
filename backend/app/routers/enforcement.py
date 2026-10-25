"""Admin APIs for consent enforcement configuration and event log."""

from typing import Annotated
from uuid import UUID

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rbac import Permission, require_permission
from app.models.enforcement import (
    EnforcementEvent,
    PurposeDataMapping,
    PurposeEnforcementConfig,
    RemediationTaskStatus,
    WithdrawalRemediationTask,
)
from app.models.integration_property import IntegrationProperty
from app.models.retention import TriggerEvent
from app.models.retention_obligation import ObligationStatus, RetentionObligation
from app.models.user import User
from app.core.config import settings
from app.schemas.enforcement import (
    EnforcementEventRead,
    PropertyEnforcementRead,
    PropertyEnforcementUpdate,
    PropertySigningSecretRead,
    PurposeEnforcementConfigRead,
    PurposeEnforcementConfigUpsert,
    PurposeDataMappingRead,
    PurposeDataMappingUpsert,
    WithdrawalRemediationSummary,
    WithdrawalRemediationTaskRead,
)

from app.services.decision_token_service import ensure_property_decision_secret
from app.services.purpose_mapping_validation import validate_purpose_data_mapping

router = APIRouter(prefix="/enforcement", tags=["enforcement"])


@router.get("/properties/{property_id}/signing-secret", response_model=PropertySigningSecretRead)
def get_property_signing_secret(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_WRITE))],
    db: Session = Depends(get_db),
) -> PropertySigningSecretRead:
    """Reveal the per-property decision token signing secret for server-side integration."""
    prop = (
        db.query(IntegrationProperty)
        .filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not prop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    secret = ensure_property_decision_secret(db, prop)
    return PropertySigningSecretRead(
        property_id=prop.id,
        signing_secret=secret,
        token_ttl_seconds=settings.DECISION_TOKEN_TTL_SECONDS,
    )


@router.get("/properties/{property_id}", response_model=PropertyEnforcementRead)
def get_property_enforcement(
    property_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    db: Session = Depends(get_db),
) -> PropertyEnforcementRead:
    prop = (
        db.query(IntegrationProperty)
        .filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not prop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    return PropertyEnforcementRead(
        property_id=prop.id,
        enforcement_mode=prop.enforcement_mode,
        has_decision_signing_secret=bool(prop.decision_signing_secret_encrypted),
    )


@router.patch("/properties/{property_id}", response_model=PropertyEnforcementRead)
def update_property_enforcement(
    property_id: UUID,
    payload: PropertyEnforcementUpdate,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_WRITE))],
    db: Session = Depends(get_db),
) -> PropertyEnforcementRead:
    prop = (
        db.query(IntegrationProperty)
        .filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not prop:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")
    prop.enforcement_mode = payload.enforcement_mode
    db.commit()
    db.refresh(prop)
    return PropertyEnforcementRead(
        property_id=prop.id,
        enforcement_mode=prop.enforcement_mode,
        has_decision_signing_secret=bool(prop.decision_signing_secret_encrypted),
    )


@router.get("/purpose-configs", response_model=list[PurposeEnforcementConfigRead])
def list_purpose_configs(
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    db: Session = Depends(get_db),
) -> list[PurposeEnforcementConfigRead]:
    rows = (
        db.query(PurposeEnforcementConfig)
        .filter(PurposeEnforcementConfig.organization_id == current_user.organization_id)
        .order_by(PurposeEnforcementConfig.created_at.desc())
        .all()
    )
    return rows


@router.put("/purpose-configs", response_model=PurposeEnforcementConfigRead)
def upsert_purpose_config(
    payload: PurposeEnforcementConfigUpsert,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_WRITE))],
    db: Session = Depends(get_db),
) -> PurposeEnforcementConfigRead:
    row = (
        db.query(PurposeEnforcementConfig)
        .filter(
            PurposeEnforcementConfig.organization_id == current_user.organization_id,
            PurposeEnforcementConfig.purpose_id == payload.purpose_id,
        )
        .first()
    )
    if row is None:
        row = PurposeEnforcementConfig(
            organization_id=current_user.organization_id,
            purpose_id=payload.purpose_id,
            mode=payload.mode,
            deny_behavior=payload.deny_behavior,
            updated_by_user_id=current_user.id,
        )
        db.add(row)
    else:
        row.mode = payload.mode
        row.deny_behavior = payload.deny_behavior
        row.updated_by_user_id = current_user.id
    db.commit()
    db.refresh(row)
    return row


@router.get("/events", response_model=list[EnforcementEventRead])
def list_enforcement_events(
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    property_id: UUID | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[EnforcementEventRead]:
    query = db.query(EnforcementEvent).filter(
        EnforcementEvent.organization_id == current_user.organization_id,
    )
    if property_id:
        query = query.filter(EnforcementEvent.property_id == property_id)
    return query.order_by(desc(EnforcementEvent.occurred_at)).limit(limit).all()


@router.get("/purpose-mappings", response_model=list[PurposeDataMappingRead])
def list_purpose_mappings(
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    purpose_id: UUID | None = Query(None),
    db: Session = Depends(get_db),
) -> list[PurposeDataMappingRead]:
    query = db.query(PurposeDataMapping).filter(
        PurposeDataMapping.organization_id == current_user.organization_id,
    )
    if purpose_id:
        query = query.filter(PurposeDataMapping.purpose_id == purpose_id)
    return query.order_by(PurposeDataMapping.created_at.desc()).all()


@router.put("/purpose-mappings", response_model=PurposeDataMappingRead)
def upsert_purpose_mapping(
    payload: PurposeDataMappingUpsert,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_WRITE))],
    db: Session = Depends(get_db),
) -> PurposeDataMappingRead:
    validate_purpose_data_mapping(
        db,
        organization_id=current_user.organization_id,
        purpose_id=payload.purpose_id,
        inventory_field_id=payload.inventory_field_id,
        withdrawal_action=payload.withdrawal_action,
    )
    row = (
        db.query(PurposeDataMapping)
        .filter(
            PurposeDataMapping.organization_id == current_user.organization_id,
            PurposeDataMapping.purpose_id == payload.purpose_id,
            PurposeDataMapping.inventory_field_id == payload.inventory_field_id,
        )
        .first()
    )
    if row is None:
        row = PurposeDataMapping(
            organization_id=current_user.organization_id,
            purpose_id=payload.purpose_id,
            inventory_field_id=payload.inventory_field_id,
            withdrawal_action=payload.withdrawal_action,
        )
        db.add(row)
    else:
        row.withdrawal_action = payload.withdrawal_action
    db.commit()
    db.refresh(row)
    return row


@router.delete("/purpose-mappings/{mapping_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purpose_mapping(
    mapping_id: UUID,
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_WRITE))],
    db: Session = Depends(get_db),
) -> None:
    row = (
        db.query(PurposeDataMapping)
        .filter(
            PurposeDataMapping.id == mapping_id,
            PurposeDataMapping.organization_id == current_user.organization_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Mapping not found")
    db.delete(row)
    db.commit()


@router.get("/remediation-tasks", response_model=list[WithdrawalRemediationTaskRead])
def list_remediation_tasks(
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    status_filter: RemediationTaskStatus | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
) -> list[WithdrawalRemediationTaskRead]:
    query = db.query(WithdrawalRemediationTask).filter(
        WithdrawalRemediationTask.organization_id == current_user.organization_id,
    )
    if status_filter:
        query = query.filter(WithdrawalRemediationTask.status == status_filter)
    return query.order_by(WithdrawalRemediationTask.sla_due_at.asc()).limit(limit).all()


@router.get("/remediation-summary", response_model=WithdrawalRemediationSummary)
def remediation_summary(
    current_user: Annotated[User, Depends(require_permission(Permission.CONSENT_READ))],
    db: Session = Depends(get_db),
) -> WithdrawalRemediationSummary:
    org_id = current_user.organization_id
    now = datetime.now(timezone.utc)
    pending = (
        db.query(func.count(WithdrawalRemediationTask.id))
        .filter(
            WithdrawalRemediationTask.organization_id == org_id,
            WithdrawalRemediationTask.status == RemediationTaskStatus.pending,
        )
        .scalar()
        or 0
    )
    overdue = (
        db.query(func.count(WithdrawalRemediationTask.id))
        .filter(
            WithdrawalRemediationTask.organization_id == org_id,
            WithdrawalRemediationTask.status.in_(
                [RemediationTaskStatus.pending, RemediationTaskStatus.in_progress]
            ),
            WithdrawalRemediationTask.sla_due_at < now,
        )
        .scalar()
        or 0
    )
    obligations = (
        db.query(func.count(RetentionObligation.id))
        .filter(
            RetentionObligation.organization_id == org_id,
            RetentionObligation.trigger_event == TriggerEvent.consent_withdrawal,
            RetentionObligation.status.in_(
                [ObligationStatus.pending, ObligationStatus.due, ObligationStatus.on_hold]
            ),
        )
        .scalar()
        or 0
    )
    return WithdrawalRemediationSummary(
        pending_tasks=pending,
        overdue_tasks=overdue,
        obligations_from_withdrawal=obligations,
    )
