from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.core.rbac import Permission, require_permission
from app.models.user import User, UserRole
from app.schemas.compliance import (
    AuditEventRead,
    AuditLogSummaryRead,
    AuditVerifyResult,
    BreachAffectedVerifyRequest,
    BreachAffectedVerifyResult,
    BreachAssignRequest,
    BreachEscalateRequest,
    BreachIncidentCreate,
    BreachIncidentRead,
    BreachIncidentUpdate,
    ComplianceMapChapter,
    ComplianceMapReviewUpdate,
    ComplianceMapSectionDetail,
    ComplianceMapSummary,
    PaginatedAuditEvents,
    SecurityControlRead,
    SecurityControlUpdate,
    SecuritySafeguardsRead,
    SecuritySafeguardsSummary,
)
from app.schemas.dashboard import (
    ComplianceScoreBreakdownRead,
    ComplianceScoreRead,
    ComplianceScoreTrendRead,
)
from app.services.audit_log_service import AuditLogService
from app.services.breach_disclosure_service import BreachDisclosureService
from app.services.compliance_map_service import ComplianceMapService
from app.services.security_safeguards_service import SecuritySafeguardsService

router = APIRouter(prefix="/compliance", tags=["compliance"])


# --- Map ---


@router.get("/map/summary", response_model=ComplianceMapSummary)
def get_map_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceMapSummary:
    return ComplianceMapService(db).get_summary(current_user, org_id=org_id)


@router.get("/map/chapters", response_model=list[ComplianceMapChapter])
def get_map_chapters(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ComplianceMapChapter]:
    return ComplianceMapService(db).get_chapters(current_user, org_id=org_id)


@router.get("/map/sections/{section_key}", response_model=ComplianceMapSectionDetail)
def get_map_section(
    section_key: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceMapSectionDetail:
    return ComplianceMapService(db).get_section_detail(current_user, section_key, org_id=org_id)


@router.get("/map/crosswalk")
def get_map_crosswalk(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    framework: str = Query(..., description="rbi | iso27001 | nist"),
    org_id: UUID | None = Query(default=None),
) -> dict:
    return ComplianceMapService(db).get_crosswalk(current_user, framework, org_id=org_id)


@router.patch("/map/review", response_model=ComplianceMapSummary)
def update_map_review(
    body: ComplianceMapReviewUpdate,
    current_user: Annotated[User, Depends(require_permission(Permission.COMPLIANCE_MANAGE))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceMapSummary:
    return ComplianceMapService(db).update_review(current_user, body, org_id=org_id)


# --- Compliance score ---


@router.get("/score", response_model=ComplianceScoreRead)
def get_compliance_score(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceScoreRead:
    return ComplianceMapService(db).get_compliance_score(current_user, org_id=org_id)


@router.get("/score/breakdown", response_model=ComplianceScoreBreakdownRead)
def get_compliance_score_breakdown(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceScoreBreakdownRead:
    return ComplianceMapService(db).get_score_breakdown(current_user, org_id=org_id)


@router.get("/score/trend", response_model=ComplianceScoreTrendRead)
def get_compliance_score_trend(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    days: int = Query(default=90, ge=7, le=365),
) -> ComplianceScoreTrendRead:
    return ComplianceMapService(db).get_score_trend(current_user, org_id=org_id, days=days)


@router.post("/score/recalculate", response_model=ComplianceScoreRead)
def recalculate_compliance_score(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> ComplianceScoreRead:
    return ComplianceMapService(db).recalculate_score(current_user, org_id=org_id)


# --- Safeguards ---


@router.get("/safeguards", response_model=SecuritySafeguardsRead)
def get_safeguards(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SecuritySafeguardsRead:
    return SecuritySafeguardsService(db).get_safeguards(current_user, org_id=org_id)


@router.get("/safeguards/summary", response_model=SecuritySafeguardsSummary)
def get_safeguards_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SecuritySafeguardsSummary:
    return SecuritySafeguardsService(db).get_summary(current_user, org_id=org_id)


@router.patch("/safeguards/controls/{control_id}", response_model=SecurityControlRead)
def update_safeguard_control(
    control_id: UUID,
    body: SecurityControlUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SecurityControlRead:
    return SecuritySafeguardsService(db).update_control(
        current_user, control_id, body, org_id=org_id
    )


# --- Breach ---


@router.get("/breaches", response_model=list[BreachIncidentRead])
def list_breaches(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[BreachIncidentRead]:
    return BreachDisclosureService(db).list_incidents(current_user, org_id=org_id)


@router.get("/breaches/active-draft", response_model=BreachIncidentRead | None)
def get_active_breach_draft(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead | None:
    return BreachDisclosureService(db).get_active_draft(current_user, org_id=org_id)


@router.post("/breaches", response_model=BreachIncidentRead, status_code=201)
def create_breach(
    body: BreachIncidentCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).create_incident(current_user, body, org_id=org_id)


@router.post("/breaches/verify-affected-principals", response_model=BreachAffectedVerifyResult)
def verify_breach_affected_principals(
    body: BreachAffectedVerifyRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachAffectedVerifyResult:
    return BreachDisclosureService(db).verify_affected_principals_from_logs(
        current_user, body, org_id=org_id
    )


@router.get("/breaches/{incident_id}", response_model=BreachIncidentRead)
def get_breach(
    incident_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).get_incident(current_user, incident_id, org_id=org_id)


@router.patch("/breaches/{incident_id}", response_model=BreachIncidentRead)
def update_breach(
    incident_id: UUID,
    body: BreachIncidentUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).update_incident(
        current_user, incident_id, body, org_id=org_id
    )


@router.post("/breaches/{incident_id}/assign", response_model=BreachIncidentRead)
def assign_breach(
    incident_id: UUID,
    body: BreachAssignRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).assign_incident(
        current_user, incident_id, body, org_id=org_id
    )


@router.post("/breaches/{incident_id}/escalate", response_model=BreachIncidentRead)
def escalate_breach(
    incident_id: UUID,
    body: BreachEscalateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).escalate_incident(
        current_user, incident_id, body, org_id=org_id
    )


@router.post("/breaches/{incident_id}/close", response_model=BreachIncidentRead)
def close_breach(
    incident_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).close_incident(
        current_user, incident_id, org_id=org_id
    )


@router.post("/breaches/{incident_id}/submit", response_model=BreachIncidentRead)
def submit_breach(
    incident_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> BreachIncidentRead:
    return BreachDisclosureService(db).submit_incident(current_user, incident_id, org_id=org_id)


@router.post("/breaches/{incident_id}/notify-dpb")
def notify_dpb(
    incident_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict[str, str]:
    return BreachDisclosureService(db).notify_dpb(current_user, incident_id, org_id=org_id)


@router.post("/breaches/{incident_id}/notify-principals")
def notify_principals(
    incident_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict[str, str]:
    return BreachDisclosureService(db).notify_principals(
        current_user, incident_id, org_id=org_id
    )


# --- Audit ---


@router.get("/audit/events", response_model=PaginatedAuditEvents)
def list_audit_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    actor: str | None = Query(default=None),
    resource_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
) -> PaginatedAuditEvents:
    return AuditLogService(db).list_events(
        current_user,
        org_id=org_id,
        q=q,
        event_type=event_type,
        actor=actor,
        resource_type=resource_type,
        page=page,
        page_size=page_size,
    )


@router.get("/audit/events/{event_id}", response_model=AuditEventRead)
def get_audit_event(
    event_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AuditEventRead:
    return AuditLogService(db).get_event(current_user, event_id, org_id=org_id)


@router.post("/audit/verify", response_model=AuditVerifyResult)
def verify_audit_log(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AuditVerifyResult:
    return AuditLogService(db).verify(current_user, org_id=org_id)


@router.get("/audit/summary", response_model=AuditLogSummaryRead)
def get_audit_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AuditLogSummaryRead:
    return AuditLogService(db).get_summary(current_user, org_id=org_id)
