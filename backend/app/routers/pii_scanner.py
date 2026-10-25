from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.pii_scan import FindingStatus
from app.models.user import User, UserRole
from app.schemas.pii_scan import (
    BulkDismissRequest,
    BulkDismissResult,
    FindingRead,
    PiiScanSummary,
    RunDueSchedulesResult,
    ScanJobDetail,
    ScanJobRead,
    ScanStartRequest,
    ScheduleCreate,
    ScheduleRead,
    ScheduleUpdate,
)
from app.services.pii_scan_service import PiiScanService, execute_pii_scan

router = APIRouter(prefix="/pii-scanner", tags=["pii-scanner"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/summary", response_model=PiiScanSummary)
def get_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PiiScanSummary:
    return PiiScanService(db).get_summary(current_user, org_id=org_id)


@router.post("/scans", response_model=ScanJobRead, status_code=202)
def start_scan(
    body: ScanStartRequest,
    current_user: AdminUser,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScanJobRead:
    """Start a scan; it runs in the background. Poll GET /scans/{id} for status."""
    job = PiiScanService(db).start_scan(
        current_user, body.data_source_id, sample_size=body.sample_size, org_id=org_id
    )
    background_tasks.add_task(execute_pii_scan, job.id)
    return job


@router.get("/scans", response_model=list[ScanJobRead])
def list_scans(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ScanJobRead]:
    return PiiScanService(db).list_jobs(current_user, org_id=org_id)


@router.get("/scans/{job_id}", response_model=ScanJobDetail)
def get_scan(
    job_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScanJobDetail:
    return PiiScanService(db).get_job(current_user, job_id, org_id=org_id)


@router.post("/scans/{job_id}/retry", response_model=ScanJobRead, status_code=202)
def retry_scan(
    job_id: UUID,
    current_user: AdminUser,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScanJobRead:
    """Re-run a failed (or completed) scan against the same source/sample size."""
    job = PiiScanService(db).retry_scan(current_user, job_id, org_id=org_id)
    background_tasks.add_task(execute_pii_scan, job.id)
    return job


@router.get("/findings", response_model=list[FindingRead])
def list_findings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    status_filter: FindingStatus | None = Query(default=None, alias="status"),
    data_source_id: UUID | None = Query(default=None),
) -> list[FindingRead]:
    return PiiScanService(db).list_findings(
        current_user, org_id=org_id, status_filter=status_filter, data_source_id=data_source_id
    )


@router.post("/findings/dismiss", response_model=BulkDismissResult)
def bulk_dismiss_findings(
    body: BulkDismissRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BulkDismissResult:
    """Dismiss many findings at once — by explicit ids and/or by filters
    (source, category, min-confidence)."""
    return PiiScanService(db).bulk_dismiss(current_user, body, org_id=org_id)


@router.post("/findings/{finding_id}/dismiss", response_model=FindingRead)
def dismiss_finding(
    finding_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> FindingRead:
    return PiiScanService(db).dismiss_finding(current_user, finding_id, org_id=org_id)


# --- recurring schedules (DPDPA Sec 10: continuous monitoring for significant
# data fiduciaries) — evaluated on demand via /schedules/run-due since this
# codebase has no standalone cron daemon. Wire that endpoint to an external
# scheduler (e.g. a nightly ops job) to make scans fully automatic. ---


@router.get("/schedules", response_model=list[ScheduleRead])
def list_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ScheduleRead]:
    return PiiScanService(db).list_schedules(current_user, org_id=org_id)


@router.post("/schedules", response_model=ScheduleRead, status_code=201)
def create_schedule(
    body: ScheduleCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScheduleRead:
    return PiiScanService(db).create_schedule(current_user, body, org_id=org_id)


@router.patch("/schedules/{schedule_id}", response_model=ScheduleRead)
def update_schedule(
    schedule_id: UUID,
    body: ScheduleUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScheduleRead:
    return PiiScanService(db).update_schedule(current_user, schedule_id, body, org_id=org_id)


@router.delete("/schedules/{schedule_id}", status_code=204)
def delete_schedule(
    schedule_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    PiiScanService(db).delete_schedule(current_user, schedule_id, org_id=org_id)


@router.post("/schedules/run-due", response_model=RunDueSchedulesResult)
def run_due_schedules(
    current_user: AdminUser,
    db: Session = Depends(get_db),
) -> RunDueSchedulesResult:
    """Manually trigger evaluation of due schedules (wire this to an external
    cron for full automation)."""
    return RunDueSchedulesResult(**PiiScanService(db).run_due_schedules())
