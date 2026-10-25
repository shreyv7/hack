import json
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.tag_manager import (
    TagManagerContainerCreate,
    TagManagerContainerUpdate,
    TagManagerContainerRead,
    ManagedTagCreate,
    ManagedTagUpdate,
    ManagedTagRead,
    TagExecutionRuleCreate,
    TagExecutionRuleUpdate,
    TagExecutionRuleRead,
    TagViolationCreate,
    TagViolationRead,
    TagManagerDailyMetricRead,
    TagManagerOverviewStats,
    TagManagerSettingsRead,
    TagManagerSettingsUpdate,
    TagExecutionLogRead,
    SimulationRequest,
    SimulationResponse,
)
from app.services.consent_service import ConsentService
from app.services.gtm_template_service import GtmTemplateService
from app.services.tag_manager_service import TagManagerService

router = APIRouter(tags=["Tag Manager"])

# --- Containers ---

@router.get("/tag-manager/containers", response_model=list[TagManagerContainerRead])
def list_containers(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TagManagerContainerRead]:
    return TagManagerService(db).list_containers(current_user, org_id=org_id)


@router.post("/tag-manager/containers", response_model=TagManagerContainerRead, status_code=status.HTTP_201_CREATED)
def create_container(
    body: TagManagerContainerCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerContainerRead:
    return TagManagerService(db).create_container(current_user, body, org_id=org_id)


@router.patch("/tag-manager/containers/{container_id}", response_model=TagManagerContainerRead)
def update_container(
    container_id: UUID,
    body: TagManagerContainerUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerContainerRead:
    return TagManagerService(db).update_container(container_id, current_user, body, org_id=org_id)


@router.delete("/tag-manager/containers/{container_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_container(
    container_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    TagManagerService(db).delete_container(container_id, current_user, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tag-manager/containers/{container_id}/sync", response_model=TagManagerContainerRead)
def sync_container(
    container_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerContainerRead:
    return TagManagerService(db).sync_container(container_id, current_user, org_id=org_id)


# --- Tags ---

@router.get("/tag-manager/tags", response_model=list[ManagedTagRead])
def list_tags(
    current_user: Annotated[User, Depends(get_current_user)],
    container_id: UUID | None = Query(default=None),
    property_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ManagedTagRead]:
    return TagManagerService(db).list_tags(container_id, property_id, current_user, org_id=org_id)


@router.post("/tag-manager/tags", response_model=ManagedTagRead, status_code=status.HTTP_201_CREATED)
def create_tag(
    body: ManagedTagCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ManagedTagRead:
    return TagManagerService(db).create_tag(current_user, body, org_id=org_id)


@router.patch("/tag-manager/tags/{tag_id}", response_model=ManagedTagRead)
def update_tag(
    tag_id: UUID,
    body: ManagedTagUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ManagedTagRead:
    return TagManagerService(db).update_tag(tag_id, current_user, body, org_id=org_id)


@router.delete("/tag-manager/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tag(
    tag_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    TagManagerService(db).delete_tag(tag_id, current_user, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Consent Rules ---

@router.get("/consent-rules", response_model=list[TagExecutionRuleRead])
def list_rules(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TagExecutionRuleRead]:
    return TagManagerService(db).list_rules(property_id, current_user, org_id=org_id)


@router.post("/consent-rules", response_model=TagExecutionRuleRead, status_code=status.HTTP_201_CREATED)
def create_rule(
    body: TagExecutionRuleCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagExecutionRuleRead:
    return TagManagerService(db).create_rule(current_user, body, org_id=org_id)


@router.patch("/consent-rules/{rule_id}", response_model=TagExecutionRuleRead)
def update_rule(
    rule_id: UUID,
    body: TagExecutionRuleUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagExecutionRuleRead:
    return TagManagerService(db).update_rule(rule_id, current_user, body, org_id=org_id)


@router.delete("/consent-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_rule(
    rule_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    TagManagerService(db).delete_rule(rule_id, current_user, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Violations ---

@router.get("/violations", response_model=list[TagViolationRead])
def list_violations(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TagViolationRead]:
    return TagManagerService(db).list_violations(property_id, current_user, org_id=org_id)


@router.post("/violations", response_model=TagViolationRead, status_code=status.HTTP_201_CREATED)
def create_violation(
    body: TagViolationCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagViolationRead:
    return TagManagerService(db).create_violation(current_user, body, org_id=org_id)


@router.post("/violations/{violation_id}/resolve", response_model=TagViolationRead)
def resolve_violation(
    violation_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagViolationRead:
    return TagManagerService(db).resolve_violation(violation_id, current_user, org_id=org_id)


# --- Analytics ---

@router.get("/analytics", response_model=list[TagManagerDailyMetricRead])
def get_analytics(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TagManagerDailyMetricRead]:
    return TagManagerService(db).get_analytics(
        property_id, current_user, org_id=org_id, days=days
    )


@router.get("/tag-manager/tag-analytics", response_model=list[TagExecutionLogRead])
def get_tag_analytics(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[TagExecutionLogRead]:
    return TagManagerService(db).get_tag_analytics(
        property_id, current_user, org_id=org_id, days=days
    )


@router.get("/tag-manager/overview", response_model=TagManagerOverviewStats)
def get_overview_stats(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerOverviewStats:
    return TagManagerService(db).get_overview_stats(property_id, current_user, org_id=org_id)


# --- Settings ---

@router.get("/tag-manager/settings", response_model=TagManagerSettingsRead)
def get_settings(
    property_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerSettingsRead:
    return TagManagerService(db).get_settings(property_id, current_user, org_id=org_id)


@router.patch("/tag-manager/settings", response_model=TagManagerSettingsRead)
def update_settings(
    property_id: UUID,
    body: TagManagerSettingsUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> TagManagerSettingsRead:
    return TagManagerService(db).update_settings(property_id, current_user, body, org_id=org_id)


# --- Trigger Simulator ---

@router.post("/simulate", response_model=SimulationResponse)
def simulate_trigger(
    body: SimulationRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SimulationResponse:
    results = TagManagerService(db).simulate_tag_trigger(
        property_id=body.property_id,
        consent_choices=body.consent_choices,
        user=current_user,
        org_id=org_id,
        record_metrics=True,
    )
    return SimulationResponse(property_id=body.property_id, results=results)


# --- GTM Template ---

@router.get("/tag-manager/gtm-template")
def download_gtm_template(
    current_user: Annotated[User, Depends(get_current_user)],
    property_id: UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
):
    resolved_org_id = ConsentService(db)._resolve_org_id(current_user, org_id)
    template = GtmTemplateService(db).generate_template(resolved_org_id, property_id)
    content = json.dumps(template, indent=2)
    return JSONResponse(
        content=template,
        headers={
            "Content-Disposition": 'attachment; filename="vajra-gtm-template.json"',
        },
    )


# --- Providers ---

@router.get("/tag-manager/providers", response_model=list[str])
def list_providers(
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[str]:
    return TagManagerService.list_providers()
