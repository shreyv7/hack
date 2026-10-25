from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.retention_obligation import ObligationStatus
from app.schemas.retention import (
    ObligationApiInfo,
    ObligationCreate,
    ObligationFulfill,
    ObligationRead,
    ObligationSummary,
    PolicyCreate,
    PolicyImpact,
    PolicyRead,
    PolicyUpdate,
    RetentionEngineResult,
    RetentionSummary,
    RunRead,
)
from app.services.retention_obligation_service import RetentionObligationService
from app.services.retention_service import RetentionService

router = APIRouter(prefix="/retention", tags=["retention"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/industry-presets")
def get_retention_industry_presets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    """Banking/DPDPA retention policy templates and evidentiary profile (Req 6)."""
    from app.models.organization_settings import OrganizationSettings
    from app.utils.industry_packs import (
        default_banking_retention_presets,
        default_dpdpa_evidentiary_profile,
        is_banking_industry,
    )

    resolved = RetentionService(db)._resolve_org_id(current_user, org_id)
    settings = db.query(OrganizationSettings).filter_by(organization_id=resolved).first()
    evidentiary = default_dpdpa_evidentiary_profile()
    if settings and settings.retention_evidentiary_config:
        evidentiary = {**evidentiary, **settings.retention_evidentiary_config}
    presets = []
    if settings and is_banking_industry(settings.primary_industry):
        presets = default_banking_retention_presets()
    return {"evidentiary_profile": evidentiary, "policy_presets": presets}


@router.get("/summary", response_model=RetentionSummary)
def get_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RetentionSummary:
    return RetentionService(db).get_summary(current_user, org_id=org_id)


@router.get("/policies", response_model=list[PolicyRead])
def list_policies(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[PolicyRead]:
    return RetentionService(db).list_policies(current_user, org_id=org_id)


@router.post("/policies", response_model=PolicyRead, status_code=201)
def create_policy(
    body: PolicyCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyRead:
    return RetentionService(db).create_policy(current_user, body, org_id=org_id)


@router.get("/policies/{policy_id}", response_model=PolicyRead)
def get_policy(
    policy_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyRead:
    return RetentionService(db).get_policy(current_user, policy_id, org_id=org_id)


@router.patch("/policies/{policy_id}", response_model=PolicyRead)
def update_policy(
    policy_id: UUID,
    body: PolicyUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyRead:
    return RetentionService(db).update_policy(current_user, policy_id, body, org_id=org_id)


@router.delete("/policies/{policy_id}", status_code=204)
def delete_policy(
    policy_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    RetentionService(db).delete_policy(current_user, policy_id, org_id=org_id)


@router.get("/policies/{policy_id}/impact", response_model=PolicyImpact)
def policy_impact(
    policy_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PolicyImpact:
    """Read-only pre-run impact: expiring-row count + FK/PK warnings."""
    return RetentionService(db).preview_impact(current_user, policy_id, org_id=org_id)


@router.post("/policies/{policy_id}/run", response_model=RunRead)
def run_policy(
    policy_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RunRead:
    return RetentionService(db).run_policy(current_user, policy_id, org_id=org_id)


@router.get("/runs", response_model=list[RunRead])
def list_runs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    policy_id: UUID | None = Query(default=None),
) -> list[RunRead]:
    return RetentionService(db).list_runs(current_user, policy_id=policy_id, org_id=org_id)


@router.post("/runs/{run_id}/confirm", response_model=RunRead)
def confirm_run(
    run_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RunRead:
    return RetentionService(db).confirm_run(current_user, run_id, org_id=org_id)


@router.post("/runs/{run_id}/execute", response_model=RunRead)
def execute_run(
    run_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RunRead:
    """Permanently delete the rows a pending delete-run matched. Destructive."""
    return RetentionService(db).execute_run(current_user, run_id, org_id=org_id)


@router.post("/admin/run-due", response_model=RetentionEngineResult)
def run_due(
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RetentionEngineResult:
    """Evaluate all due active policies now (auto_delete ones execute). Lets you
    trigger the engine without waiting for the scheduler."""
    return RetentionService(db).run_due_for_org(current_user, org_id=org_id)


# --- application-level erasure obligations (Stage 4) ---

@router.get("/obligations", response_model=list[ObligationRead])
def list_obligations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    status_filter: ObligationStatus | None = Query(default=None, alias="status"),
) -> list[ObligationRead]:
    return RetentionObligationService(db).list_obligations(
        current_user, org_id=org_id, status_filter=status_filter
    )


@router.get("/obligations/summary", response_model=ObligationSummary)
def obligations_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ObligationSummary:
    return RetentionObligationService(db).get_summary(current_user, org_id=org_id)


def _public_base(request: Request) -> str:
    """Prefer an explicitly configured public URL; otherwise use the live request
    host so deployed environments (e.g. GCP) never surface a localhost URL."""
    configured = (settings.BACKEND_PUBLIC_URL or "").rstrip("/")
    if configured and "localhost" not in configured and "127.0.0.1" not in configured:
        return configured
    return str(request.base_url).rstrip("/")


@router.get("/obligations/api-info", response_model=ObligationApiInfo)
def obligations_api_info(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ObligationApiInfo:
    return RetentionObligationService(db).api_info(
        current_user, org_id=org_id, base_url=_public_base(request)
    )


@router.post("/obligations", response_model=ObligationRead, status_code=201)
def create_obligation(
    body: ObligationCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ObligationRead:
    return RetentionObligationService(db).create_manual(current_user, body, org_id=org_id)


@router.post("/obligations/{obligation_id}/fulfill", response_model=ObligationRead)
def fulfill_obligation(
    obligation_id: UUID,
    body: ObligationFulfill,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ObligationRead:
    return RetentionObligationService(db).fulfill_manual(
        current_user, obligation_id, body, org_id=org_id
    )


@router.post("/obligations/{obligation_id}/cancel", response_model=ObligationRead)
def cancel_obligation(
    obligation_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ObligationRead:
    return RetentionObligationService(db).cancel(current_user, obligation_id, org_id=org_id)
