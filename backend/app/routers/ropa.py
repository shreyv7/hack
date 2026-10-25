from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.ropa import (
    BusinessUnitCreate,
    BusinessUnitRead,
    DepartmentCreate,
    DepartmentRead,
    TeamCreate,
    TeamRead,
    ProcessingActivityCreate,
    ProcessingActivityUpdate,
    ProcessingActivityRead,
    ProcessingActivityDetailRead,
    RopaApprovalDecision,
    RopaCheckoutPayload,
    RopaRollbackPayload,
    ActivityApprovalRead,
    ActivityVersionRead,
    VersionDiffRead,
    RopaDashboardKPIs,
    RopaDiscoverySuggestionRead,
    RopaBankingPresetsRead,
    CreateDpiaFromActivityRead,
    LinkedConsentNoticeRead,
)
from app.services.ropa_service import RopaService
from app.services.ropa_workflow_service import RopaWorkflowService
from app.services.ropa_version_service import RopaVersionService
from app.services.ropa_discovery_service import RopaDiscoveryService

router = APIRouter(prefix="/ropa", tags=["ropa"])


def _enrich_activity_detail(
    service: RopaService, activity, detail_schema: ProcessingActivityDetailRead, org_id: UUID
) -> ProcessingActivityDetailRead:
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None

    if activity.banking_context:
        from app.schemas.ropa import RopaBankingContext
        detail_schema.banking_context = RopaBankingContext.model_validate(activity.banking_context)

    for owner in detail_schema.owners:
        owner_model = next((o for o in activity.owners if o.id == owner.id), None)
        if owner_model and owner_model.user:
            owner.user_email = owner_model.user.email
            owner.user_name = owner_model.user.full_name

    for purpose in detail_schema.purposes:
        purpose_model = next((p for p in activity.purposes if p.id == purpose.id), None)
        if purpose_model and purpose_model.purpose:
            purpose.purpose_name = purpose_model.purpose.name

    for system in detail_schema.systems:
        system_model = next((s for s in activity.systems if s.id == system.id), None)
        if system_model and system_model.property:
            system.property_name = system_model.property.display_name or system_model.property.domain

    for rp in detail_schema.retention_policies:
        rp_model = next((r for r in activity.retention_policies if r.id == rp.id), None)
        if rp_model:
            denorm = service._denormalize_retention_row(rp_model)
            rp.linked_policy_name = denorm["linked_policy_name"]
            rp.effective_retention_period = denorm["effective_retention_period"]
            rp.effective_trigger_event = denorm["effective_trigger_event"]
            rp.effective_legal_basis = denorm["effective_legal_basis"]

    for ds in detail_schema.data_sources:
        ds_model = next((d for d in activity.data_sources if d.id == ds.id), None)
        if ds_model and ds_model.data_source:
            ds.data_source_name = ds_model.data_source.name

    for link in detail_schema.dpia_links:
        link_model = next((l for l in activity.dpia_links if l.id == link.id), None)
        if link_model and link_model.dpia:
            link.dpia_title = link_model.dpia.title
            link.dpia_status = link_model.dpia.status

    purpose_ids = [p.purpose_id for p in activity.purposes]
    detail_schema.linked_consent_notices = [
        LinkedConsentNoticeRead.model_validate(n)
        for n in service.get_linked_consent_notices(org_id, purpose_ids)
    ]

    return detail_schema


# --- Hierarchy endpoints ---

@router.post("/business-units", response_model=BusinessUnitRead, status_code=status.HTTP_201_CREATED)
def create_business_unit(
    payload: BusinessUnitCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BusinessUnitRead:
    return RopaService(db).create_business_unit(current_user, payload, org_id=org_id)


@router.get("/business-units", response_model=list[BusinessUnitRead])
def list_business_units(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[BusinessUnitRead]:
    return RopaService(db).list_business_units(current_user, org_id=org_id)


@router.post("/departments", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DepartmentRead:
    return RopaService(db).create_department(current_user, payload, org_id=org_id)


@router.get("/departments", response_model=list[DepartmentRead])
def list_departments(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DepartmentRead]:
    return RopaService(db).list_departments(current_user, org_id=org_id)


@router.post("/teams", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    payload: TeamCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TeamRead:
    return RopaService(db).create_team(current_user, payload, org_id=org_id)


@router.get("/teams", response_model=list[TeamRead])
def list_teams(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TeamRead]:
    return RopaService(db).list_teams(current_user, org_id=org_id)


# --- Processing Activities CRUD endpoints ---

@router.get("/dashboard", response_model=RopaDashboardKPIs)
def get_dashboard_kpis(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    business_unit_id: UUID | None = Query(default=None),
) -> RopaDashboardKPIs:
    return RopaService(db).get_dashboard_kpis(
        current_user, org_id=org_id, business_unit_id=business_unit_id
    )


@router.get("/banking-presets", response_model=RopaBankingPresetsRead)
def get_banking_presets(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RopaBankingPresetsRead:
    return RopaService(db).get_banking_presets(current_user, org_id=org_id)


@router.post("/activities", response_model=ProcessingActivityDetailRead, status_code=status.HTTP_201_CREATED)
def create_activity(
    payload: ProcessingActivityCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProcessingActivityDetailRead:
    service = RopaService(db)
    resolved_org = service._resolve_org_id(current_user, org_id)
    activity = service.create_activity(current_user, payload, org_id=org_id)
    activity = service.get_activity(current_user, activity.id, org_id=org_id)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    return _enrich_activity_detail(service, activity, detail_schema, resolved_org)


@router.get("/activities", response_model=list[ProcessingActivityRead])
def list_activities(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    search: str | None = Query(default=None),
    department_id: UUID | None = Query(default=None),
    owner_id: UUID | None = Query(default=None),
    status: str | None = Query(default=None),
    risk_level: str | None = Query(default=None),
    destination_country: str | None = Query(default=None),
    purpose_id: UUID | None = Query(default=None),
    vendor_id: UUID | None = Query(default=None),
    lawful_basis: str | None = Query(default=None),
    retention_period: str | None = Query(default=None),
    system_name: str | None = Query(default=None),
) -> list[ProcessingActivityRead]:
    # We load business unit name, department name, team name on each record
    activities = RopaService(db).list_activities(
        user=current_user,
        org_id=org_id,
        search=search,
        department_id=department_id,
        owner_id=owner_id,
        status_filter=status,
        risk_level=risk_level,
        destination_country=destination_country,
        purpose_id=purpose_id,
        vendor_id=vendor_id,
        lawful_basis=lawful_basis,
        retention_period=retention_period,
        system_name=system_name,
    )
    
    # Map model properties to schema format
    result = []
    for activity in activities:
        read_schema = ProcessingActivityRead.model_validate(activity)
        read_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
        read_schema.department_name = activity.department.name if activity.department else None
        read_schema.team_name = activity.team.name if activity.team else None
        result.append(read_schema)
        
    return result


@router.get("/activities/{activity_id}", response_model=ProcessingActivityDetailRead)
def get_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProcessingActivityDetailRead:
    service = RopaService(db)
    resolved_org = service._resolve_org_id(current_user, org_id)
    activity = service.get_activity(current_user, activity_id, org_id=org_id)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    return _enrich_activity_detail(service, activity, detail_schema, resolved_org)


@router.patch("/activities/{activity_id}", response_model=ProcessingActivityDetailRead)
def update_activity(
    activity_id: UUID,
    payload: ProcessingActivityUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ProcessingActivityDetailRead:
    service = RopaService(db)
    resolved_org = service._resolve_org_id(current_user, org_id)
    activity = service.update_activity(current_user, activity_id, payload, org_id=org_id)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    return _enrich_activity_detail(service, activity, detail_schema, resolved_org)


@router.post("/activities/{activity_id}/create-dpia", response_model=CreateDpiaFromActivityRead)
def create_dpia_from_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> CreateDpiaFromActivityRead:
    return RopaService(db).create_dpia_from_activity(current_user, activity_id, org_id=org_id)


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    RopaService(db).soft_delete_activity(current_user, activity_id, org_id=org_id)


# --- Lifecycle / Workflow endpoints ---

@router.post("/activities/{activity_id}/submit", response_model=list[ActivityApprovalRead])
def submit_for_review(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[ActivityApprovalRead]:
    return RopaWorkflowService().submit_for_review(db, activity_id, current_user)


@router.post("/approvals/{approval_id}/decision", response_model=ActivityApprovalRead)
def process_approval_decision(
    approval_id: UUID,
    payload: RopaApprovalDecision,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ActivityApprovalRead:
    return RopaWorkflowService().process_decision(
        db, approval_id, payload.status, payload.comments, current_user
    )


@router.post("/activities/{activity_id}/publish", response_model=ProcessingActivityDetailRead)
def publish_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ProcessingActivityDetailRead:
    activity = RopaWorkflowService().publish_activity(db, activity_id, current_user)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None
    return detail_schema


@router.post("/activities/{activity_id}/deprecate", response_model=ProcessingActivityDetailRead)
def deprecate_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ProcessingActivityDetailRead:
    activity = RopaWorkflowService().deprecate_activity(db, activity_id, current_user)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None
    return detail_schema


@router.post("/activities/{activity_id}/archive", response_model=ProcessingActivityDetailRead)
def archive_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ProcessingActivityDetailRead:
    activity = RopaWorkflowService().archive_activity(db, activity_id, current_user)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None
    return detail_schema


@router.post("/activities/{activity_id}/restore", response_model=ProcessingActivityDetailRead)
def restore_activity(
    activity_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ProcessingActivityDetailRead:
    activity = RopaWorkflowService().restore_activity(db, activity_id, current_user)
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None
    return detail_schema


# --- Versioning endpoints ---

@router.post("/activities/{activity_id}/checkout", response_model=ActivityVersionRead)
def checkout_new_version(
    activity_id: UUID,
    payload: RopaCheckoutPayload,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ActivityVersionRead:
    return RopaVersionService().checkout_new_version(db, activity_id, payload.changelog, current_user)


@router.get("/activities/versions/compare", response_model=VersionDiffRead)
def compare_versions(
    current_user: Annotated[User, Depends(get_current_user)],
    version_a_id: UUID = Query(...),
    version_b_id: UUID = Query(...),
    db: Session = Depends(get_db),
) -> VersionDiffRead:
    # Check permissions if needed
    return RopaVersionService().compare_versions(db, version_a_id, version_b_id)



@router.post("/activities/{activity_id}/rollback", response_model=ActivityVersionRead)
def rollback_to_version(
    activity_id: UUID,
    payload: RopaRollbackPayload,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ActivityVersionRead:
    return RopaVersionService().rollback_to_version(db, activity_id, payload.version_id, current_user)


# --- AI Auto-Discovery Suggestions Endpoints ---

@router.get("/suggestions", response_model=list[RopaDiscoverySuggestionRead])
def list_suggestions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RopaDiscoverySuggestionRead]:
    return RopaDiscoveryService(db).list_suggestions(current_user, org_id=org_id)


@router.post("/suggestions/{suggestion_id}/accept", response_model=ProcessingActivityDetailRead)
def accept_suggestion(
    suggestion_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> ProcessingActivityDetailRead:
    created = RopaDiscoveryService(db).accept_suggestion(current_user, suggestion_id)
    activity = RopaService(db).get_activity(
        current_user, created.id, org_id=created.organization_id
    )
    detail_schema = ProcessingActivityDetailRead.model_validate(activity)
    detail_schema.business_unit_name = activity.business_unit.name if activity.business_unit else None
    detail_schema.department_name = activity.department.name if activity.department else None
    detail_schema.team_name = activity.team.name if activity.team else None
    return detail_schema


@router.post("/suggestions/{suggestion_id}/dismiss", response_model=RopaDiscoverySuggestionRead)
def dismiss_suggestion(
    suggestion_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> RopaDiscoverySuggestionRead:
    return RopaDiscoveryService(db).dismiss_suggestion(current_user, suggestion_id)


@router.post("/suggestions/scan", response_model=list[RopaDiscoverySuggestionRead])
def scan_suggestions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RopaDiscoverySuggestionRead]:
    return RopaDiscoveryService(db).scan_sources(current_user, org_id=org_id)


@router.get("/export")
def export_ropa_register(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    format: str = Query(default="pdf", alias="format"),
    purpose_id: UUID | None = Query(default=None),
    channel: str | None = Query(default=None),
    business_unit_id: UUID | None = Query(default=None),
) -> StreamingResponse:
    content, content_type = RopaService(db).export_register_bytes(
        current_user,
        org_id=org_id,
        fmt=format,
        purpose_id=purpose_id,
        channel=channel,
        business_unit_id=business_unit_id,
    )
    ext = {"pdf": "pdf", "xlsx": "xlsx", "json": "json"}.get(format, format)
    return StreamingResponse(
        iter([content]),
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="ropa_register.{ext}"'},
    )

