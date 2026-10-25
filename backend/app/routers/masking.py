from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from fastapi import HTTPException, status

from app.schemas.masking import (
    AnonymizeTextRequest,
    AnonymizeTextResult,
    ApplyMaskingRequest,
    ApplyMaskingResult,
    FieldPreviewRequest,
    FieldPreviewResult,
    MaskingCapabilities,
    MaskingRuleRead,
    MaskingRuleUpsert,
    MaskingRunRead,
    MaskingSummary,
    PiiColumnTarget,
    PreviewRequest,
    PreviewResult,
)
from app.services.masking_service import MaskingService

router = APIRouter(prefix="/masking", tags=["masking"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/capabilities", response_model=MaskingCapabilities)
def get_capabilities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> MaskingCapabilities:
    return MaskingService(db).capabilities()


@router.get("/rules", response_model=list[MaskingRuleRead])
def list_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[MaskingRuleRead]:
    return MaskingService(db).get_rules(current_user, org_id=org_id)


@router.put("/rules", response_model=MaskingRuleRead)
def upsert_rule(
    body: MaskingRuleUpsert,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> MaskingRuleRead:
    return MaskingService(db).upsert_rule(current_user, body, org_id=org_id)


@router.get("/pii-columns", response_model=list[PiiColumnTarget])
def list_pii_columns(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[PiiColumnTarget]:
    """PII columns detected by the scanner, ready to preview/mask."""
    return MaskingService(db).list_pii_columns(current_user, org_id=org_id)


@router.get("/summary", response_model=MaskingSummary)
def get_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> MaskingSummary:
    return MaskingService(db).get_summary(current_user, org_id=org_id)


@router.get("/runs", response_model=list[MaskingRunRead])
def list_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[MaskingRunRead]:
    return MaskingService(db).list_runs(current_user, org_id=org_id, limit=limit, offset=offset)


@router.post("/preview", response_model=PreviewResult)
def preview(
    body: PreviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> PreviewResult:
    return MaskingService(db).preview(body.strategy, body.value, body.params)


@router.post("/preview-field", response_model=FieldPreviewResult)
def preview_field(
    body: FieldPreviewRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> FieldPreviewResult:
    return MaskingService(db).preview_field(
        current_user, body.data_source_id, body.table, body.column, body.strategy, body.limit, org_id=org_id
    )


@router.post("/apply", response_model=ApplyMaskingResult)
def apply_masking(
    body: ApplyMaskingRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ApplyMaskingResult:
    """DESTRUCTIVE: rewrite a column's values in the live source database."""
    if not body.confirm:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="This permanently modifies live data. Set confirm=true to proceed.",
        )
    return MaskingService(db).apply_to_column(
        current_user, body.data_source_id, body.table, body.column,
        body.strategy, body.id_column, org_id=org_id,
        asset_id=body.asset_id, inventory_field_id=body.inventory_field_id,
    )


@router.post("/anonymize-text", response_model=AnonymizeTextResult)
def anonymize_text(
    body: AnonymizeTextRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> AnonymizeTextResult:
    return MaskingService(db).anonymize_text(body.text)
