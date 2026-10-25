from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.anonymisation import (
    AnonymisationJobCreate,
    AnonymisationJobRead,
    AnonymisationSummary,
    DatasetOption,
    DatasetPreview,
    DownloadJustification,
    DownloadLogRead,
    RiskPreviewRequest,
    RiskPreviewResult,
)
from app.services.anonymisation_service import AnonymisationService, execute_anon_job

router = APIRouter(prefix="/anonymisation", tags=["anonymisation"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/summary", response_model=AnonymisationSummary)
def get_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AnonymisationSummary:
    return AnonymisationService(db).get_summary(current_user, org_id=org_id)


@router.get("/datasets", response_model=list[DatasetOption])
def list_datasets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DatasetOption]:
    return AnonymisationService(db).list_datasets(current_user, org_id=org_id)


@router.get("/datasets/{asset_id}/preview", response_model=DatasetPreview)
def preview_dataset(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DatasetPreview:
    return AnonymisationService(db).preview_dataset(current_user, asset_id, org_id=org_id)


@router.post("/preview-risk", response_model=RiskPreviewResult)
def preview_risk(
    body: RiskPreviewRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RiskPreviewResult:
    return AnonymisationService(db).preview_risk(current_user, body, org_id=org_id)


@router.get("/jobs", response_model=list[AnonymisationJobRead])
def list_jobs(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[AnonymisationJobRead]:
    return AnonymisationService(db).list_jobs(current_user, org_id=org_id)


@router.post("/jobs", response_model=AnonymisationJobRead, status_code=201)
def create_job(
    body: AnonymisationJobCreate,
    current_user: AdminUser,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AnonymisationJobRead:
    """Create the job (returns immediately as 'running'); anonymisation runs in
    a background task — poll GET /jobs/{id} for completion."""
    job = AnonymisationService(db).create_job(current_user, body, org_id=org_id)
    background_tasks.add_task(execute_anon_job, job.id)
    return job


@router.post("/run-maintenance")
def run_maintenance(
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict[str, int]:
    """Run due recurring jobs now and re-check re-identification risk (drift)."""
    return AnonymisationService(db).run_maintenance_for_org(current_user, org_id=org_id)


@router.get("/jobs/{job_id}", response_model=AnonymisationJobRead)
def get_job(
    job_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AnonymisationJobRead:
    return AnonymisationService(db).get_job(current_user, job_id, org_id=org_id)


@router.post("/jobs/{job_id}/download")
def download_output(
    job_id: UUID,
    body: DownloadJustification,
    current_user: AdminUser,
    request: Request,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> FileResponse:
    """Download the anonymised dataset. Requires a justification (purpose + who
    it's shared with); each download is recorded to the audit trail."""
    ip = request.client.host if request.client else None
    path, filename = AnonymisationService(db).record_download(
        current_user, job_id, body, ip=ip, org_id=org_id
    )
    return FileResponse(path, filename=filename, media_type="text/csv")


@router.get("/jobs/{job_id}/downloads", response_model=list[DownloadLogRead])
def list_downloads(
    job_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DownloadLogRead]:
    """Audit history of who downloaded this dataset, when, and why."""
    return AnonymisationService(db).list_downloads(current_user, job_id, org_id=org_id)


@router.get("/jobs/{job_id}/evidence")
def download_evidence(
    job_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    pdf, filename = AnonymisationService(db).build_evidence_pdf(current_user, job_id, org_id=org_id)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )