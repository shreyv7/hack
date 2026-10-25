from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.child_data import ChildConsentStatus
from app.models.user import User, UserRole
from app.schemas.child_data import (
    AutoDetectRequest,
    AutoDetectResult,
    BulkConsentPreview,
    BulkConsentResult,
    BulkRequestParentalConsent,
    ChildApiInfo,
    ChildDataSummary,
    ChildRecordCreate,
    ChildRecordRead,
    ChildRecordUpdate,
    ConsentEvidenceRead,
    ConsentRequestResult,
    EnforcementDecision,
    EnforcementRequest,
    MaintenanceResult,
    RecordParentalConsent,
    RequestParentalConsent,
)
from app.services.child_consent_email import send_bulk_consent_request_emails
from app.services.child_data_service import ChildDataService

router = APIRouter(prefix="/childrens-data", tags=["childrens-data"])

AdminUser = Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))]


@router.get("/api-info", response_model=ChildApiInfo)
def get_api_info(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildApiInfo:
    """Endpoint URLs + the org's API key prefix for the developer integration page."""
    return ChildDataService(db).api_info(current_user, org_id=org_id)


@router.get("/summary", response_model=ChildDataSummary)
def get_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildDataSummary:
    return ChildDataService(db).get_summary(current_user, org_id=org_id)


@router.get("/records", response_model=list[ChildRecordRead])
def list_records(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    status_filter: ChildConsentStatus | None = Query(default=None, alias="status"),
) -> list[ChildRecordRead]:
    return ChildDataService(db).list_records(current_user, org_id=org_id, status_filter=status_filter)


@router.post("/records", response_model=ChildRecordRead, status_code=201)
def create_record(
    body: ChildRecordCreate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildRecordRead:
    return ChildDataService(db).create_record(current_user, body, org_id=org_id)


@router.get("/records/{record_id}", response_model=ChildRecordRead)
def get_record(
    record_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildRecordRead:
    return ChildDataService(db).get_record(current_user, record_id, org_id=org_id)


@router.patch("/records/{record_id}", response_model=ChildRecordRead)
def update_record(
    record_id: UUID,
    body: ChildRecordUpdate,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildRecordRead:
    return ChildDataService(db).update_record(current_user, record_id, body, org_id=org_id)


@router.delete("/records/{record_id}", status_code=204)
def delete_record(
    record_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    ChildDataService(db).delete_record(current_user, record_id, org_id=org_id)


@router.post("/enforce", response_model=EnforcementDecision)
def enforce(
    body: EnforcementRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> EnforcementDecision:
    """Decision API: is `purpose` allowed for this subject under DPDPA s.9?
    External systems (marketing, ad-targeting, SDK) call this before processing."""
    return ChildDataService(db).check_enforcement(
        current_user, body.subject_ref, body.purpose, org_id=org_id
    )


@router.post("/auto-detect", response_model=AutoDetectResult)
def auto_detect(
    body: AutoDetectRequest,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AutoDetectResult:
    return ChildDataService(db).auto_detect(
        current_user,
        body.data_source_id,
        table=body.table,
        dob_column=body.dob_column,
        id_column=body.id_column,
        parent_email_column=body.parent_email_column,
        org_id=org_id,
    )


@router.get("/records/{record_id}/evidence", response_model=ConsentEvidenceRead)
def get_consent_evidence(
    record_id: UUID,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentEvidenceRead:
    """Full parental-consent audit trail for one record (admin-only)."""
    return ChildDataService(db).get_consent_evidence(current_user, record_id, org_id=org_id)


@router.post("/records/{record_id}/record-consent", response_model=ChildRecordRead)
def record_parental_consent(
    record_id: UUID,
    body: RecordParentalConsent,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ChildRecordRead:
    return ChildDataService(db).record_consent(current_user, record_id, body, org_id=org_id)


@router.post("/run-maintenance", response_model=MaintenanceResult)
def run_maintenance(
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> MaintenanceResult:
    """Run the lifecycle pass now: re-detect minors, age out 18+, expire consents."""
    return ChildDataService(db).run_maintenance_for_org(current_user, org_id=org_id)


@router.post("/records/{record_id}/request-consent", response_model=ConsentRequestResult)
def request_parental_consent(
    record_id: UUID,
    body: RequestParentalConsent,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ConsentRequestResult:
    """Email the parent a secure self-service link to grant/decline consent."""
    return ChildDataService(db).request_consent(current_user, record_id, body, org_id=org_id)


@router.post("/request-consent/bulk/preview", response_model=BulkConsentPreview)
def preview_bulk_request_consent(
    body: BulkRequestParentalConsent,
    current_user: AdminUser,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BulkConsentPreview:
    """Dry run: how many records the bulk send would email vs skip (no email)."""
    return ChildDataService(db).preview_bulk_consent(current_user, body, org_id=org_id)


@router.post("/request-consent/bulk", response_model=BulkConsentResult)
def bulk_request_consent(
    body: BulkRequestParentalConsent,
    current_user: AdminUser,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BulkConsentResult:
    """Email a consent link to every record in the chosen statuses that has a
    parent email. Records are marked 'pending' immediately; the emails are sent
    off the request path."""
    svc = ChildDataService(db)
    payloads, skipped, meta = svc.prepare_bulk_consent(current_user, body, org_id=org_id)
    if payloads:
        background_tasks.add_task(send_bulk_consent_request_emails, payloads, **meta)
    if payloads and skipped:
        message = f"Emailing {len(payloads)} parent(s); {skipped} record(s) skipped (no email on file)."
    elif payloads:
        message = f"Emailing {len(payloads)} parent(s)."
    elif skipped:
        message = f"Nothing sent — {skipped} matching record(s) have no parent email on file."
    else:
        message = "No records matched the selected statuses."
    return BulkConsentResult(queued=len(payloads), skipped_no_email=skipped, message=message)
