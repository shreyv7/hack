"""Validate purpose→field mappings — prevent destructive actions on shared fields."""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.consent import LegalBasis, Purpose
from app.models.enforcement import PurposeDataMapping, WithdrawalAction

DESTRUCTIVE_WITHDRAWAL_ACTIONS = frozenset(
    {
        WithdrawalAction.mask,
        WithdrawalAction.anonymize,
        WithdrawalAction.delete,
        WithdrawalAction.pseudonymize,
    }
)


def validate_purpose_data_mapping(
    db: Session,
    *,
    organization_id: UUID,
    purpose_id: UUID,
    inventory_field_id: UUID,
    withdrawal_action: WithdrawalAction,
) -> None:
    """Block mask/delete/anonymize when the same field serves a non-consent purpose."""
    if withdrawal_action not in DESTRUCTIVE_WITHDRAWAL_ACTIONS:
        return

    other_mappings = (
        db.query(PurposeDataMapping)
        .filter(
            PurposeDataMapping.organization_id == organization_id,
            PurposeDataMapping.inventory_field_id == inventory_field_id,
            PurposeDataMapping.purpose_id != purpose_id,
        )
        .all()
    )
    for mapping in other_mappings:
        other_purpose = db.get(Purpose, mapping.purpose_id)
        if other_purpose is None:
            continue
        if other_purpose.legal_basis != LegalBasis.consent:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Field is also mapped to non-consent purpose '{other_purpose.name}'. "
                    f"Use withdrawal action 'suppress' instead of '{withdrawal_action.value}' "
                    "to stop marketing use without mutating shared data."
                ),
            )
