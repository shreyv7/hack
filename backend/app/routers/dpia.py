from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.dpia import (
    Dpia, DpiaVersion, DpiaStep, DpiaRisk, DpiaControl, DpiaApproval, DpiaReviewCycle,
    DpiaTask, DpiaEvidence, DpiaComment, DpiaEvent, DpiaTemplate,
    DpiaDataflow, DpiaAsset, DpiaComplianceCheck, DpiaStatus, DpiaVersionStatus,
    DpiaControlLibrary
)
from app.schemas.dpia import (
    DpiaRead, DpiaDetailRead, DpiaCreate, DpiaUpdate, DpiaVersionRead,
    DpiaStepAnswerRead, DpiaStepAnswerCreate, DpiaRiskRead, DpiaRiskCreate,
    DpiaRiskUpdate, DpiaControlRead, DpiaControlCreate, DpiaControlUpdate,
    DpiaApprovalRead, DpiaApprovalDecision, DpiaCommentRead, DpiaCommentCreate,
    DpiaEventRead, DpiaEvidenceRead, DpiaSummaryStats, DpiaTemplateRead,
    DpiaDataflowRead, DpiaDataflowUpdate, DpiaAssetRead, DpiaAssetCreate,
    DpiaControlLibraryRead
)
from app.services.dpia.governance import DpiaGovernanceService
from app.services.dpia.risk_engine import DpiaRiskEngine
from app.services.dpia.workflow import DpiaWorkflowService
from app.services.dpia.rule_engine import DpiaRuleEngine
from app.services.dpia.compliance import DpiaComplianceService
from app.services.dpia.evidence import DpiaEvidenceService

router = APIRouter(prefix="/dpia", tags=["dpia"])


def resolve_org_id(user: User, org_id: UUID | None) -> UUID:
    if user.role == UserRole.superadmin:
        if not org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="org_id parameter required for superadmin",
            )
        return org_id
    return user.organization_id


def get_dpia_or_404(db: Session, dpia_id: UUID, user: User) -> Dpia:
    q = db.query(Dpia).filter(Dpia.id == dpia_id)
    if user.role != UserRole.superadmin:
        q = q.filter(Dpia.organization_id == user.organization_id)
    dpia = q.first()
    if not dpia:
        raise HTTPException(status_code=404, detail="DPIA not found")
    return dpia


def get_dpia_with_version_or_404(db: Session, dpia_id: UUID, user: User) -> Dpia:
    dpia = get_dpia_or_404(db, dpia_id, user)
    if not dpia.current_version_id:
        raise HTTPException(status_code=404, detail="DPIA version context missing")
    return dpia


@router.get("/summary", response_model=DpiaSummaryStats)
def get_dpia_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None)
) -> DpiaSummaryStats:
    resolved_org_id = resolve_org_id(current_user, org_id)
    
    total = db.query(Dpia).filter(Dpia.organization_id == resolved_org_id).count()
    
    # Calculate risks
    high_count = 0
    critical_count = 0
    dpias = db.query(Dpia).filter(Dpia.organization_id == resolved_org_id).all()
    
    risk_dist = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    
    for d in dpias:
        if not d.current_version_id:
            continue
        v_risks = db.query(DpiaRisk).filter(DpiaRisk.version_id == d.current_version_id).all()
        for r in v_risks:
            val = float(r.residual_score or r.inherent_score or 0)
            if val >= 50:
                critical_count += 1
                risk_dist["critical"] += 1
            elif val >= 30:
                high_count += 1
                risk_dist["high"] += 1
            elif val >= 15:
                risk_dist["medium"] += 1
            else:
                risk_dist["low"] += 1

    pending_revs = (
        db.query(DpiaReviewCycle)
        .join(Dpia)
        .filter(
            Dpia.organization_id == resolved_org_id,
            DpiaReviewCycle.status.in_(["scheduled", "active", "overdue"])
        )
        .count()
    )

    pending_apps = (
        db.query(DpiaApproval)
        .join(DpiaVersion)
        .join(Dpia)
        .filter(
            Dpia.organization_id == resolved_org_id,
            DpiaApproval.status == "pending"
        )
        .count()
    )

    overdue_tasks = (
        db.query(DpiaTask)
        .join(DpiaRisk)
        .join(DpiaVersion)
        .join(Dpia)
        .filter(
            Dpia.organization_id == resolved_org_id,
            DpiaTask.status == "overdue"
        )
        .count()
    )

    # Compliance average
    comp_serv = DpiaComplianceService()
    scores = []
    for d in dpias:
        if d.current_version_id:
            scores.append(comp_serv.evaluate_compliance(db, d.current_version_id))
    avg_comp = round(sum(scores) / len(scores), 2) if scores else 100.0

    # Recent Audit Trail
    events = (
        db.query(DpiaEvent)
        .join(Dpia)
        .filter(Dpia.organization_id == resolved_org_id)
        .order_by(DpiaEvent.created_at.desc())
        .limit(10)
        .all()
    )

    return DpiaSummaryStats(
        total_dpias=total,
        high_risk=high_count,
        critical_risk=critical_count,
        pending_reviews=pending_revs,
        pending_approvals=pending_apps,
        overdue_tasks=overdue_tasks,
        compliance_score=avg_comp,
        risk_level_distribution=risk_dist,
        department_distribution={"AI & Engineering": total, "Marketing": 0},
        recent_events=[DpiaEventRead.model_validate(e) for e in events]
    )


@router.post("", response_model=DpiaRead, status_code=status.HTTP_201_CREATED)
def create_dpia(
    payload: DpiaCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DpiaRead:
    resolved_org_id = resolve_org_id(current_user, org_id)
    dpia = DpiaGovernanceService().create_dpia(
        db=db,
        org_id=resolved_org_id,
        payload=payload,
        actor_id=current_user.id
    )
    return DpiaRead.model_validate(dpia)


@router.get("", response_model=list[DpiaRead])
def list_dpias(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    query: str | None = Query(default=None),
    status: str | None = Query(default=None)
) -> list[DpiaRead]:
    resolved_org_id = resolve_org_id(current_user, org_id)
    q = db.query(Dpia).filter(Dpia.organization_id == resolved_org_id)

    if status:
        q = q.filter(Dpia.status == status)
    if query:
        q = q.filter(
            or_(
                Dpia.title.icontains(query),
                Dpia.description.icontains(query),
                Dpia.dpia_ref.icontains(query)
            )
        )
    dpias = q.order_by(Dpia.created_at.desc()).all()
    return [DpiaRead.model_validate(d) for d in dpias]


@router.get("/templates", response_model=list[DpiaTemplateRead])
def list_dpia_templates(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DpiaTemplateRead]:
    if current_user.role == UserRole.superadmin:
        resolved_org_id = org_id
    else:
        resolved_org_id = current_user.organization_id

    org_filters = [DpiaTemplate.organization_id == None]
    if resolved_org_id is not None:
        org_filters.append(DpiaTemplate.organization_id == resolved_org_id)

    templates = db.query(DpiaTemplate).filter(or_(*org_filters)).all()
    return [DpiaTemplateRead.model_validate(t) for t in templates]


@router.get("/control-library", response_model=list[DpiaControlLibraryRead])
def list_control_library(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DpiaControlLibraryRead]:
    resolved_org_id = resolve_org_id(current_user, org_id)
    controls = DpiaRiskEngine().get_control_library(db, resolved_org_id)
    return [DpiaControlLibraryRead.model_validate(c) for c in controls]


@router.get("/{id}", response_model=DpiaDetailRead)
def get_dpia_detail(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaDetailRead:
    dpia = get_dpia_or_404(db, id, current_user)

    # Load steps, versions, and current active version details
    steps = db.query(DpiaStep).filter(DpiaStep.dpia_id == id).order_by(DpiaStep.step_order.asc()).all()
    versions = db.query(DpiaVersion).filter(DpiaVersion.dpia_id == id).order_by(DpiaVersion.version_number.desc()).all()

    # Load current active version
    current_version = None
    if dpia.current_version_id:
        v = db.query(DpiaVersion).filter(DpiaVersion.id == dpia.current_version_id).first()
        if v:
            current_version = v

    return DpiaDetailRead(
        id=dpia.id,
        organization_id=dpia.organization_id,
        dpia_ref=dpia.dpia_ref,
        title=dpia.title,
        description=dpia.description,
        current_version_id=dpia.current_version_id,
        status=dpia.status,
        created_at=dpia.created_at,
        updated_at=dpia.updated_at,
        steps=steps,
        versions=versions,
        current_version=current_version
    )


@router.put("/{id}", response_model=DpiaRead)
def update_dpia(
    id: UUID,
    payload: DpiaUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaRead:
    dpia = DpiaGovernanceService().update_dpia(db, id, payload, current_user.id)
    return DpiaRead.model_validate(dpia)


@router.delete("/{id}", response_model=DpiaRead)
def archive_dpia(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaRead:
    dpia = DpiaGovernanceService().update_dpia(
        db, id, DpiaUpdate(status=DpiaStatus.archived.value), current_user.id
    )
    return DpiaRead.model_validate(dpia)


@router.post("/{id}/checkout", response_model=DpiaVersionRead)
def checkout_new_version(
    id: UUID,
    changelog: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaVersionRead:
    new_ver = DpiaGovernanceService().checkout_new_version(db, id, changelog, current_user.id)
    return DpiaVersionRead.model_validate(new_ver)


@router.post("/{id}/step-answer", response_model=DpiaStepAnswerRead)
def save_step_answer(
    id: UUID,
    payload: DpiaStepAnswerCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaStepAnswerRead:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    ans = DpiaGovernanceService().save_step_answer(db, dpia.current_version_id, payload, current_user.id)
    return DpiaStepAnswerRead.model_validate(ans)


@router.get("/{id}/risks", response_model=list[DpiaRiskRead])
def list_dpia_risks(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaRiskRead]:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    risks = DpiaRiskEngine().list_risks(db, dpia.current_version_id)
    return [DpiaRiskRead.model_validate(r) for r in risks]


@router.post("/{id}/risks", response_model=DpiaRiskRead)
def add_dpia_risk(
    id: UUID,
    payload: DpiaRiskCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaRiskRead:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    risk = DpiaRiskEngine().add_risk(db, dpia.current_version_id, payload)
    return DpiaRiskRead.model_validate(risk)


@router.put("/{id}/risks/{rid}", response_model=DpiaRiskRead)
def update_dpia_risk(
    id: UUID,
    rid: UUID,
    payload: DpiaRiskUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaRiskRead:
    risk = DpiaRiskEngine().update_risk(db, rid, payload)
    return DpiaRiskRead.model_validate(risk)


@router.delete("/{id}/risks/{rid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dpia_risk(
    id: UUID,
    rid: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    DpiaRiskEngine().delete_risk(db, rid)


@router.post("/{id}/risks/{rid}/controls", response_model=DpiaControlRead)
def add_mitigation_control(
    id: UUID,
    rid: UUID,
    payload: DpiaControlCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaControlRead:
    ctrl = DpiaRiskEngine().add_control_to_risk(db, rid, payload)
    return DpiaControlRead.model_validate(ctrl)


@router.put("/{id}/controls/{cid}", response_model=DpiaControlRead)
def update_control_status(
    id: UUID,
    cid: UUID,
    payload: DpiaControlUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaControlRead:
    ctrl = DpiaRiskEngine().update_control_status(db, cid, payload)
    return DpiaControlRead.model_validate(ctrl)


@router.post("/{id}/controls/{cid}/verify", response_model=DpiaControlRead)
def verify_control(
    id: UUID,
    cid: UUID,
    is_verified: bool,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db)
) -> DpiaControlRead:
    ctrl = DpiaRiskEngine().verify_control(db, cid, current_user.id, is_verified)
    return DpiaControlRead.model_validate(ctrl)


@router.post("/{id}/submit", response_model=list[DpiaApprovalRead])
def submit_for_approval(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaApprovalRead]:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    approvals = DpiaWorkflowService().submit_for_approval(db, dpia.current_version_id, current_user.id)
    return [DpiaApprovalRead.model_validate(a) for a in approvals]


@router.put("/approvals/{aid}/decision", response_model=DpiaApprovalRead)
def process_approval_decision(
    aid: UUID,
    payload: DpiaApprovalDecision,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaApprovalRead:
    app = DpiaWorkflowService().process_decision(db, aid, payload, current_user.id)
    return DpiaApprovalRead.model_validate(app)


@router.get("/{id}/approvals", response_model=list[DpiaApprovalRead])
def list_dpia_approvals(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaApprovalRead]:
    dpia = get_dpia_with_version_or_404(db, id, current_user)
    approvals = DpiaWorkflowService().list_approvals(db, dpia.current_version_id)
    return [DpiaApprovalRead.model_validate(a) for a in approvals]


@router.get("/{id}/comments", response_model=list[DpiaCommentRead])
def list_dpia_comments(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaCommentRead]:
    comments = DpiaGovernanceService().list_comments(db, id)
    return [DpiaCommentRead.model_validate(c) for c in comments]


@router.post("/{id}/comments", response_model=DpiaCommentRead)
def add_dpia_comment(
    id: UUID,
    payload: DpiaCommentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaCommentRead:
    comment = DpiaGovernanceService().add_comment(
        db=db,
        dpia_id=id,
        parent_comment_id=payload.parent_comment_id,
        step_key=payload.step_key,
        content=payload.content,
        actor_id=current_user.id
    )
    return DpiaCommentRead.model_validate(comment)


@router.get("/{id}/events", response_model=list[DpiaEventRead])
def list_dpia_events(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaEventRead]:
    events = db.query(DpiaEvent).filter(DpiaEvent.dpia_id == id).order_by(DpiaEvent.created_at.desc()).all()
    return [DpiaEventRead.model_validate(e) for e in events]


@router.get("/{id}/dataflow", response_model=DpiaDataflowRead)
def get_dpia_dataflow(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaDataflowRead:
    df = DpiaGovernanceService().get_dataflow(db, id)
    if not df:
        raise HTTPException(status_code=404, detail="Data flow mapper not initialized")
    return DpiaDataflowRead.model_validate(df)


@router.put("/{id}/dataflow", response_model=DpiaDataflowRead)
def update_dpia_dataflow(
    id: UUID,
    payload: DpiaDataflowUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaDataflowRead:
    df = DpiaGovernanceService().update_dataflow(db, id, payload.flow_data)
    return DpiaDataflowRead.model_validate(df)


@router.get("/{id}/assets", response_model=list[DpiaAssetRead])
def list_dpia_assets(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> list[DpiaAssetRead]:
    assets = DpiaGovernanceService().list_assets(db, id)
    return [DpiaAssetRead.model_validate(a) for a in assets]


@router.post("/{id}/assets", response_model=DpiaAssetRead)
def link_dpia_asset(
    id: UUID,
    payload: DpiaAssetCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> DpiaAssetRead:
    asset = DpiaGovernanceService().add_asset(db, id, payload.asset_type, payload.asset_id)
    return DpiaAssetRead.model_validate(asset)


@router.delete("/{id}/assets/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def unlink_dpia_asset(
    id: UUID,
    asset_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    DpiaGovernanceService().remove_asset(db, id, asset_id)


@router.post("/{id}/evaluate-rules", status_code=status.HTTP_200_OK)
def evaluate_rules(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> dict:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    count = DpiaRuleEngine().evaluate_rules(db, dpia.current_version_id)
    return {"status": "success", "rules_triggered": count}


@router.post("/{id}/evaluate-compliance", status_code=status.HTTP_200_OK)
def evaluate_compliance(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> dict:
    dpia = get_dpia_with_version_or_404(db, id, current_user)

    score = DpiaComplianceService().evaluate_compliance(db, dpia.current_version_id)
    return {"status": "success", "compliance_score": score}


@router.post("/{id}/evidence", response_model=DpiaEvidenceRead)
async def upload_evidence(
    id: UUID,
    linked_control_id: UUID | None = Form(default=None),
    linked_answer_id: UUID | None = Form(default=None),
    file: UploadFile = File(...),
    current_user: Annotated[User, Depends(get_current_user)] = None,
    db: Session = Depends(get_db)
) -> DpiaEvidenceRead:
    content = await file.read()
    dpia = get_dpia_or_404(db, id, current_user)
    evidence = DpiaEvidenceService().upload_evidence(
        db=db,
        org_id=dpia.organization_id,
        file_name=file.filename,
        file_content=content,
        uploaded_by_user_id=current_user.id,
        linked_control_id=linked_control_id,
        linked_answer_id=linked_answer_id
    )
    return DpiaEvidenceRead.model_validate(evidence)


from app.services.dpia.ai import DpiaAiService

@router.post("/{id}/ai/analyze", status_code=status.HTTP_200_OK)
def analyze_dpia_ai(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> dict:
    get_dpia_or_404(db, id, current_user)
    
    analysis = DpiaAiService.analyze_dpia(db, id)
    return {"status": "success", "analysis": analysis}


@router.get("/{id}/ai/recommendations", status_code=status.HTTP_200_OK)
def get_dpia_ai_recommendations(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> dict:
    get_dpia_or_404(db, id, current_user)
    
    recommendations = DpiaAiService.get_recommendations(db, id)
    return {"status": "success", "recommendations": recommendations}


@router.get("/{id}/scanner/results", status_code=status.HTTP_200_OK)
def get_dpia_scanner_results(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
) -> dict:
    get_dpia_or_404(db, id, current_user)
    
    # Mocking scanner discovery diff for the UI as per the prompt requirement
    mock_diff = {
        "discovered_fields": [
            {"field": "user_profiles.aadhaar_hash", "category": "National ID", "status": "new_discovery"},
            {"field": "user_profiles.pan_number", "category": "Financial", "status": "new_discovery"},
            {"field": "medical_records.blood_group", "category": "Health", "status": "new_discovery"}
        ],
        "existing_fields": [
            {"field": "user_profiles.email", "category": "Contact", "status": "mapped"}
        ]
    }
    return {"status": "success", "scanner_results": mock_diff}


from fastapi.responses import StreamingResponse
from app.services.dpia.pdf_export import DpiaPdfExportService

@router.post("/{id}/export-pdf", status_code=status.HTTP_200_OK)
def export_dpia_pdf(
    id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db)
):
    dpia = get_dpia_or_404(db, id, current_user)
    
    try:
        pdf_buffer = DpiaPdfExportService.export_dpia_to_pdf(db, id)
        return StreamingResponse(
            pdf_buffer, 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=dpia_{dpia.dpia_ref}.pdf"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
