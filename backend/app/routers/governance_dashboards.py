"""REST API for Governance → Compliance Dashboards module."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.governance_dashboard import (
    AiDashboardRequest,
    AiDashboardResponse,
    AuditRead,
    GovernanceAiAssistRequest,
    GovernanceAiAssistResponse,
    DashboardCreate,
    DashboardDetailRead,
    DashboardLayoutUpdate,
    DashboardRead,
    DashboardUpdate,
    DashboardVersionRead,
    ExportRequest,
    ExportResponse,
    MetricsQuery,
    PaginatedAudit,
    PaginatedDashboards,
    PublicDashboardRead,
    PublicLinkCreate,
    PublicLinkRead,
    ScheduleCreate,
    ScheduleRead,
    ScheduleUpdate,
    ShareCreate,
    ShareRead,
    TemplateRead,
    WidgetCreate,
    WidgetMetricsResponse,
    WidgetRead,
    WidgetTypeCatalogItem,
    WidgetUpdate,
)
from app.services.governance_ai_service import GovernanceAiService
from app.services.governance_audit_service import GovernanceAuditService
from app.services.governance_dashboard_service import GovernanceDashboardService
from app.services.governance_export_service import GovernanceExportService
from app.services.governance_metrics_service import GovernanceMetricsService
from app.services.governance_schedule_service import GovernanceScheduleService
from app.services.governance_sharing_service import GovernanceSharingService
from app.services.governance_template_service import GovernanceTemplateService

router = APIRouter(prefix="/governance/dashboards", tags=["governance-dashboards"])


# --- Dashboards CRUD ---

@router.get("", response_model=PaginatedDashboards)
def list_dashboards(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    pinned_only: bool = Query(default=False),
    sort: str = Query(default="updated_at"),
) -> PaginatedDashboards:
    return GovernanceDashboardService(db).list_dashboards(
        current_user, org_id=org_id, page=page, page_size=page_size, search=search, pinned_only=pinned_only, sort=sort
    )


@router.post("", response_model=DashboardDetailRead, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    body: DashboardCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardDetailRead:
    return GovernanceDashboardService(db).create_dashboard(current_user, body, org_id=org_id)


# Static paths must be registered before /{dashboard_id}

@router.get("/catalog/templates", response_model=list[TemplateRead])
def list_templates(
    current_user: Annotated[User, Depends(get_current_user)],
    search: str | None = Query(default=None),
) -> list[TemplateRead]:
    return GovernanceTemplateService().list_templates(search)


@router.get("/catalog/widgets", response_model=list[WidgetTypeCatalogItem])
def list_widget_catalog(
    current_user: Annotated[User, Depends(get_current_user)],
    category: str | None = Query(default=None),
) -> list[WidgetTypeCatalogItem]:
    return GovernanceTemplateService().list_widget_catalog(category)


@router.post("/metrics/query", response_model=WidgetMetricsResponse)
def fetch_metrics(
    body: MetricsQuery,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WidgetMetricsResponse:
    return GovernanceMetricsService(db).fetch_widget_metrics(current_user, body, org_id=org_id)


@router.get("/audit/log", response_model=PaginatedAudit)
def list_audit(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    dashboard_id: UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
) -> PaginatedAudit:
    from app.services.compliance_base import ComplianceBaseService

    resolved = ComplianceBaseService(db)._resolve_org_id(current_user, org_id)
    items, total = GovernanceAuditService(db).list_audits(
        resolved, dashboard_id=dashboard_id, page=page, page_size=page_size, search=search
    )
    pages = max(1, (total + page_size - 1) // page_size)
    return PaginatedAudit(
        items=[
            AuditRead(
                id=i.id,
                dashboard_id=i.dashboard_id,
                organization_id=i.organization_id,
                user_id=i.user_id,
                user_name=i.user.full_name if i.user else None,
                action=i.action,
                details_json=i.details_json,
                created_at=i.created_at,
            )
            for i in items
        ],
        total=total,
        page=page,
        page_size=page_size,
        pages=pages,
    )


@router.post("/ai/assist", response_model=GovernanceAiAssistResponse)
def ai_assist(
    body: GovernanceAiAssistRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> GovernanceAiAssistResponse:
    """Vajra AI governance assistant (primary AI endpoint)."""
    return GovernanceAiService(db).assist(current_user, body, org_id=org_id)


@router.post("/ai/analyze", response_model=AiDashboardResponse)
def ai_analyze(
    body: AiDashboardRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AiDashboardResponse:
    """Legacy rule-based analysis endpoint (kept for compatibility)."""
    return GovernanceAiService(db).analyze(current_user, body, org_id=org_id)


@router.get("/public/{token}", response_model=PublicDashboardRead)
def get_public_dashboard(
    token: str,
    db: Session = Depends(get_db),
    password: str | None = Query(default=None),
) -> PublicDashboardRead:
    return GovernanceSharingService(db).get_public_dashboard(token, password)


@router.get("/{dashboard_id}", response_model=DashboardDetailRead)
def get_dashboard(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardDetailRead:
    return GovernanceDashboardService(db).get_dashboard(current_user, dashboard_id, org_id=org_id)


@router.patch("/{dashboard_id}", response_model=DashboardDetailRead)
def update_dashboard(
    dashboard_id: UUID,
    body: DashboardUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardDetailRead:
    return GovernanceDashboardService(db).update_dashboard(current_user, dashboard_id, body, org_id=org_id)


@router.delete("/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    GovernanceDashboardService(db).delete_dashboard(current_user, dashboard_id, org_id=org_id)


@router.post("/{dashboard_id}/clone", response_model=DashboardDetailRead)
def clone_dashboard(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardDetailRead:
    return GovernanceDashboardService(db).clone_dashboard(current_user, dashboard_id, org_id=org_id)


@router.post("/{dashboard_id}/favourite", response_model=DashboardRead)
def toggle_favourite(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardRead:
    return GovernanceDashboardService(db).toggle_favourite(current_user, dashboard_id, org_id=org_id)


@router.put("/{dashboard_id}/layout", response_model=DashboardDetailRead)
def update_layout(
    dashboard_id: UUID,
    body: DashboardLayoutUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardDetailRead:
    return GovernanceDashboardService(db).update_layout(current_user, dashboard_id, body, org_id=org_id)


@router.get("/{dashboard_id}/versions", response_model=list[DashboardVersionRead])
def list_versions(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DashboardVersionRead]:
    return GovernanceDashboardService(db).list_versions(current_user, dashboard_id, org_id=org_id)


# --- Widgets ---

@router.post("/{dashboard_id}/widgets", response_model=WidgetRead, status_code=status.HTTP_201_CREATED)
def add_widget(
    dashboard_id: UUID,
    body: WidgetCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WidgetRead:
    return GovernanceDashboardService(db).add_widget(current_user, dashboard_id, body, org_id=org_id)


@router.patch("/{dashboard_id}/widgets/{widget_id}", response_model=WidgetRead)
def update_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    body: WidgetUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WidgetRead:
    return GovernanceDashboardService(db).update_widget(current_user, dashboard_id, widget_id, body, org_id=org_id)


@router.post("/{dashboard_id}/widgets/{widget_id}/duplicate", response_model=WidgetRead)
def duplicate_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WidgetRead:
    return GovernanceDashboardService(db).duplicate_widget(current_user, dashboard_id, widget_id, org_id=org_id)


@router.delete("/{dashboard_id}/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_widget(
    dashboard_id: UUID,
    widget_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    GovernanceDashboardService(db).delete_widget(current_user, dashboard_id, widget_id, org_id=org_id)


# --- Export ---

@router.post("/{dashboard_id}/export", response_model=ExportResponse)
def export_dashboard(
    dashboard_id: UUID,
    body: ExportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ExportResponse:
    return GovernanceExportService(db).export_dashboard(current_user, dashboard_id, body, org_id=org_id)


# --- Sharing ---

@router.get("/{dashboard_id}/shares", response_model=list[ShareRead])
def list_shares(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ShareRead]:
    return GovernanceSharingService(db).list_shares(current_user, dashboard_id, org_id=org_id)


@router.post("/{dashboard_id}/shares", response_model=ShareRead, status_code=status.HTTP_201_CREATED)
def add_share(
    dashboard_id: UUID,
    body: ShareCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ShareRead:
    return GovernanceSharingService(db).add_share(current_user, dashboard_id, body, org_id=org_id)


@router.delete("/{dashboard_id}/shares/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_share(
    dashboard_id: UUID,
    share_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    GovernanceSharingService(db).remove_share(current_user, dashboard_id, share_id, org_id=org_id)


@router.post("/{dashboard_id}/public-link", response_model=PublicLinkRead)
def create_public_link(
    dashboard_id: UUID,
    body: PublicLinkCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> PublicLinkRead:
    return GovernanceSharingService(db).create_public_link(current_user, dashboard_id, body, org_id=org_id)


@router.delete("/{dashboard_id}/public-link/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_public_link(
    dashboard_id: UUID,
    share_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    GovernanceSharingService(db).revoke_public_link(current_user, dashboard_id, share_id, org_id=org_id)


# --- Schedules ---

@router.get("/{dashboard_id}/schedules", response_model=list[ScheduleRead])
def list_schedules(
    dashboard_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ScheduleRead]:
    return GovernanceScheduleService(db).list_schedules(current_user, dashboard_id, org_id=org_id)


@router.post("/{dashboard_id}/schedules", response_model=ScheduleRead, status_code=status.HTTP_201_CREATED)
def create_schedule(
    dashboard_id: UUID,
    body: ScheduleCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScheduleRead:
    return GovernanceScheduleService(db).create_schedule(current_user, dashboard_id, body, org_id=org_id)


@router.patch("/{dashboard_id}/schedules/{schedule_id}", response_model=ScheduleRead)
def update_schedule(
    dashboard_id: UUID,
    schedule_id: UUID,
    body: ScheduleUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ScheduleRead:
    return GovernanceScheduleService(db).update_schedule(current_user, dashboard_id, schedule_id, body, org_id=org_id)


@router.delete("/{dashboard_id}/schedules/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_schedule(
    dashboard_id: UUID,
    schedule_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> None:
    GovernanceScheduleService(db).delete_schedule(current_user, dashboard_id, schedule_id, org_id=org_id)
