import os
from typing import Annotated, List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, UploadFile, File, Form, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.ciso import CisoBoardReport
from app.utils.paths import get_ciso_report_path
from app.schemas.ciso import (
    CisoDashboardSummary,
    CisoControlRead,
    CisoControlCreate,
    CisoControlUpdate,
    CisoEvidenceRead,
    CisoRiskRead,
    CisoRiskCreate,
    CisoRemediationTaskRead,
    CisoRemediationTaskCreate,
    CisoRemediationTaskUpdate,
    CisoExceptionRead,
    CisoExceptionCreate,
    CisoControlCommentRead,
    CisoControlCommentCreate,
    CisoControlReviewRead,
    CisoControlReviewCreate,
    CisoScoreSettingsRead,
    CisoScoreSettingsUpdate,
    CisoScoreSnapshotRead,
    CisoBoardReportRead,
    CisoControlVersionRead,
    CisoActivityRead,
    CisoOrganizationControlRead,
    CisoOrganizationControlCreate,
    CisoOrganizationControlUpdate,
    SecurityAssetRead,
    SecurityAssetCreate,
    SecurityAssetUpdate,
    VulnerabilityScanLogRead,
)
from app.services.ciso_service import CisoService

router = APIRouter(prefix="/ciso", tags=["ciso"])


@router.get("/dashboard", response_model=CisoDashboardSummary)
def get_dashboard(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoDashboardSummary:
    return CisoService(db).get_dashboard_summary(current_user, org_id=org_id)


@router.get("/controls", response_model=List[CisoControlRead])
def list_controls(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    status: Optional[str] = Query(default=None),
    framework: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    org_id: UUID | None = Query(default=None),
) -> List[CisoControlRead]:
    return CisoService(db).list_controls(current_user, status=status, framework=framework, search=search, org_id=org_id)


@router.get("/controls/{control_id}", response_model=CisoControlRead)
def get_control(
    control_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).get_control_detail(current_user, control_id, org_id=org_id)


@router.post("/controls", response_model=CisoControlRead)
def create_control(
    body: CisoControlCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).create_control(current_user, body, org_id=org_id)


@router.patch("/controls/{control_id}", response_model=CisoControlRead)
def update_control(
    control_id: UUID,
    body: CisoControlUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).update_control(current_user, control_id, body, org_id=org_id)


# --- Comments & Reviews ---
@router.post("/controls/{control_id}/comments", response_model=CisoControlCommentRead)
def add_comment(
    control_id: UUID,
    body: CisoControlCommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlCommentRead:
    return CisoService(db).add_comment(current_user, control_id, body, org_id=org_id)


@router.post("/controls/{control_id}/reviews", response_model=CisoControlReviewRead)
def add_review(
    control_id: UUID,
    body: CisoControlReviewCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlReviewRead:
    return CisoService(db).add_review(current_user, control_id, body, org_id=org_id)


# --- Exceptions ---
@router.get("/exceptions", response_model=List[CisoExceptionRead])
def list_exceptions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoExceptionRead]:
    return CisoService(db).list_exceptions(current_user, org_id=org_id)


@router.post("/exceptions", response_model=CisoExceptionRead)
def create_exception(
    body: CisoExceptionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoExceptionRead:
    return CisoService(db).create_exception(current_user, body, org_id=org_id)


# --- Evidence ---
@router.get("/evidence", response_model=List[CisoEvidenceRead])
def list_evidence(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoEvidenceRead]:
    return CisoService(db).list_evidence(current_user, org_id=org_id)


@router.post("/evidence", response_model=CisoEvidenceRead)
async def upload_evidence(
    file: UploadFile = File(...),
    name: str = Form(...),
    control_id: UUID | None = Form(default=None),
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoEvidenceRead:
    content = await file.read()
    control_ids = [control_id] if control_id else []
    return CisoService(db).create_evidence(
        current_user,
        name=name,
        file_name=file.filename,
        file_content=content,
        file_type=file.content_type,
        control_ids=control_ids,
        org_id=org_id
    )


@router.get("/evidence/{evidence_id}/download")
def download_evidence(
    evidence_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    import os
    from fastapi.responses import FileResponse
    
    evidence = CisoService(db).get_evidence(current_user, evidence_id, org_id=org_id)
    if not evidence:
        raise HTTPException(status_code=404, detail="Evidence not found")
        
    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    storage_path = os.path.join(backend_dir, "storage", f"{evidence.file_hash}_{evidence.file_name}")
    
    if not os.path.exists(storage_path):
        raise HTTPException(status_code=404, detail="Physical evidence file not found on disk")
        
    return FileResponse(
        path=storage_path,
        filename=evidence.file_name,
        media_type=evidence.file_type or "application/octet-stream"
    )


@router.delete("/evidence/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_evidence(
    evidence_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    CisoService(db).delete_evidence(current_user, evidence_id, org_id=org_id)
    return None


# --- Risks ---
@router.get("/risks", response_model=List[CisoRiskRead])
def list_risks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoRiskRead]:
    return CisoService(db).list_risks(current_user, org_id=org_id)


@router.post("/risks", response_model=CisoRiskRead)
def create_risk(
    body: CisoRiskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoRiskRead:
    return CisoService(db).create_risk(current_user, body, org_id=org_id)


# --- Remediation Tasks ---
@router.get("/remediation", response_model=List[CisoRemediationTaskRead])
def list_remediation_tasks(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoRemediationTaskRead]:
    return CisoService(db).list_remediation_tasks(current_user, org_id=org_id)


@router.post("/remediation", response_model=CisoRemediationTaskRead)
def create_remediation_task(
    body: CisoRemediationTaskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    control_ids: Optional[List[UUID]] = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoRemediationTaskRead:
    return CisoService(db).create_remediation_task(current_user, body, control_ids=control_ids, org_id=org_id)


@router.patch("/remediation/{task_id}", response_model=CisoRemediationTaskRead)
def update_remediation_task(
    task_id: UUID,
    body: CisoRemediationTaskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoRemediationTaskRead:
    return CisoService(db).update_remediation_task(current_user, task_id, body, org_id=org_id)


# --- Settings ---
@router.get("/settings", response_model=CisoScoreSettingsRead)
def get_settings(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoScoreSettingsRead:
    return CisoService(db).get_or_create_settings(org_id or current_user.organization_id)


@router.patch("/settings", response_model=CisoScoreSettingsRead)
def update_settings(
    body: CisoScoreSettingsUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoScoreSettingsRead:
    return CisoService(db).update_settings(current_user, body, org_id=org_id)


# --- Analytics ---
@router.get("/analytics", response_model=List[CisoScoreSnapshotRead])
def get_analytics(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    days: int = Query(default=30),
    org_id: UUID | None = Query(default=None),
) -> List[CisoScoreSnapshotRead]:
    return CisoService(db).get_analytics_trends(current_user, days=days, org_id=org_id)


# --- Reports ---
@router.get("/reports", response_model=List[CisoBoardReportRead])
def list_board_reports(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoBoardReportRead]:
    return CisoService(db).list_board_reports(current_user, org_id=org_id)


@router.post("/reports/generate", response_model=CisoBoardReportRead)
def generate_board_report(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoBoardReportRead:
    return CisoService(db).generate_board_report(current_user, org_id=org_id)


@router.get("/reports/download/{report_id}")
def download_board_report(
    report_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    # Retrieve report metadata
    report = db.query(CisoBoardReport).filter(CisoBoardReport.id == report_id).first()
    if not report:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Board report not found")

    # Multi-tenant security check
    user_role_str = current_user.role.value if hasattr(current_user.role, 'value') else str(current_user.role)
    is_superadmin = (user_role_str == 'superadmin') or getattr(current_user, 'is_superadmin', False)

    if not is_superadmin and current_user.organization_id != report.organization_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied to this board report")

    pdf_path = str(get_ciso_report_path(report.id))
    if not os.path.exists(pdf_path):
        os.makedirs(os.path.dirname(pdf_path), exist_ok=True)
        # Regenerate report PDF dynamically if template file is missing
        CisoService(db)._build_report_pdf(
            pdf_path,
            report.title,
            report.score_snapshot,
            CisoService(db).get_dashboard_summary(current_user, org_id=report.organization_id),
            user=current_user,
            org_id=report.organization_id
        )

    return FileResponse(
        path=pdf_path,
        filename=f"{report.title.replace(' ', '_')}.pdf",
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{report.title.replace(" ", "_")}.pdf"'
        }
    )


# --- Activities & Versions ---
@router.get("/activities", response_model=List[CisoActivityRead])
def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    entity_type: Optional[str] = Query(default=None),
    entity_id: Optional[UUID] = Query(default=None),
    limit: int = Query(default=50),
    org_id: UUID | None = Query(default=None),
) -> List[CisoActivityRead]:
    return CisoService(db).list_activities(current_user, entity_type=entity_type, entity_id=entity_id, limit=limit, org_id=org_id)


@router.get("/controls/{control_id}/versions", response_model=List[CisoControlVersionRead])
def get_control_versions(
    control_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoControlVersionRead]:
    return CisoService(db).list_control_versions(current_user, control_id, org_id=org_id)


# --- Organization Controls Library ---
@router.get("/organization-controls", response_model=List[CisoOrganizationControlRead])
def list_organization_controls(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[CisoOrganizationControlRead]:
    return CisoService(db).list_organization_controls(current_user, org_id=org_id)


@router.post("/organization-controls", response_model=CisoOrganizationControlRead)
def create_organization_control(
    body: CisoOrganizationControlCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoOrganizationControlRead:
    return CisoService(db).create_organization_control(current_user, body, org_id=org_id)


@router.patch("/organization-controls/{control_id}", response_model=CisoOrganizationControlRead)
def update_organization_control(
    control_id: UUID,
    body: CisoOrganizationControlUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoOrganizationControlRead:
    return CisoService(db).update_organization_control(current_user, control_id, body, org_id=org_id)


@router.delete("/organization-controls/{control_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization_control(
    control_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    CisoService(db).delete_organization_control(current_user, control_id, org_id=org_id)
    return None


# --- Security Assets ---
@router.get("/assets", response_model=List[SecurityAssetRead])
def list_assets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[SecurityAssetRead]:
    return CisoService(db).list_assets(current_user, org_id=org_id)


@router.post("/assets", response_model=SecurityAssetRead, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: SecurityAssetCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SecurityAssetRead:
    return CisoService(db).create_asset(current_user, body, org_id=org_id)


@router.patch("/assets/{asset_id}", response_model=SecurityAssetRead)
def update_asset(
    asset_id: UUID,
    body: SecurityAssetUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SecurityAssetRead:
    return CisoService(db).update_asset(current_user, asset_id, body, org_id=org_id)


@router.delete("/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    CisoService(db).delete_asset(current_user, asset_id, org_id=org_id)
    return None


@router.post("/controls/{control_id}/link-asset/{asset_id}", response_model=CisoControlRead)
def link_asset(
    control_id: UUID,
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).link_asset_to_control(current_user, control_id, asset_id, org_id=org_id)


@router.post("/controls/{control_id}/unlink-asset/{asset_id}", response_model=CisoControlRead)
def unlink_asset(
    control_id: UUID,
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).unlink_asset_from_control(current_user, control_id, asset_id, org_id=org_id)


@router.post("/controls/{control_id}/link-policy/{policy_id}", response_model=CisoControlRead)
def link_policy(
    control_id: UUID,
    policy_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).link_policy_to_control(current_user, control_id, policy_id, org_id=org_id)


@router.post("/controls/{control_id}/unlink-policy/{policy_id}", response_model=CisoControlRead)
def unlink_policy(
    control_id: UUID,
    policy_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CisoControlRead:
    return CisoService(db).unlink_policy_from_control(current_user, control_id, policy_id, org_id=org_id)


# --- Vulnerability Scanning Logs ---
@router.post("/assets/{asset_id}/trigger-scan", response_model=VulnerabilityScanLogRead)
def trigger_scan(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> VulnerabilityScanLogRead:
    return CisoService(db).trigger_asset_scan(current_user, asset_id, org_id=org_id)


@router.get("/assets/{asset_id}/scan-logs", response_model=List[VulnerabilityScanLogRead])
def list_scan_logs(
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> List[VulnerabilityScanLogRead]:
    return CisoService(db).list_scan_logs(current_user, asset_id, org_id=org_id)


@router.get("/benchmark-matrix")
def get_benchmark_matrix(
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Return the official read-only CIS Controls v8 benchmark standard parsed from cis.xlsx."""
    import json
    parsed_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "cis_parsed.json")
    if os.path.exists(parsed_path):
        with open(parsed_path, "r") as f:
            return json.load(f)
    return []


