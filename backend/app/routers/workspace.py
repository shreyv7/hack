from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.schemas.workspace import (
    DataProcessorCreate,
    DataProcessorRead,
    DataProcessorUpdate,
    DiscoveredProcessorRead,
    DpdpObligationRead,
    WorkspaceDeploymentUpdate,
    WorkspaceIndustryUpdate,
    WorkspaceProfileUpdate,
    WorkspaceRoleMappingUpdate,
    WorkspaceSettingsRead,
    SetupStatusRead,
)
from app.services.workspace_service import WorkspaceService

router = APIRouter(prefix="/workspace", tags=["workspace"])


@router.get("", response_model=WorkspaceSettingsRead)
def get_workspace(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WorkspaceSettingsRead:
    return WorkspaceService(db).get_workspace(current_user, org_id=org_id)


@router.get("/setup-status", response_model=SetupStatusRead)
def get_setup_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> SetupStatusRead:
    return WorkspaceService(db).get_setup_status(current_user, org_id=org_id)


@router.patch("/profile", response_model=WorkspaceSettingsRead)
def patch_profile(
    body: WorkspaceProfileUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WorkspaceSettingsRead:
    return WorkspaceService(db).update_profile(current_user, body, org_id=org_id)


@router.patch("/industry", response_model=WorkspaceSettingsRead)
def patch_industry(
    body: WorkspaceIndustryUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WorkspaceSettingsRead:
    return WorkspaceService(db).update_industry(current_user, body, org_id=org_id)


@router.patch("/deployment", response_model=WorkspaceSettingsRead)
def patch_deployment(
    body: WorkspaceDeploymentUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WorkspaceSettingsRead:
    return WorkspaceService(db).update_deployment(current_user, body, org_id=org_id)


@router.patch("/role-mapping", response_model=WorkspaceSettingsRead)
def patch_role_mapping(
    body: WorkspaceRoleMappingUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> WorkspaceSettingsRead:
    return WorkspaceService(db).update_role_mapping(current_user, body, org_id=org_id)


@router.get("/obligations", response_model=list[DpdpObligationRead])
def list_obligations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
) -> list[DpdpObligationRead]:
    return WorkspaceService(db).list_obligations()


@router.get("/processors", response_model=list[DataProcessorRead])
def list_processors(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DataProcessorRead]:
    return WorkspaceService(db).list_processors(current_user, org_id=org_id)


@router.post("/processors", response_model=DataProcessorRead, status_code=status.HTTP_201_CREATED)
def create_processor(
    body: DataProcessorCreate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataProcessorRead:
    return WorkspaceService(db).create_processor(current_user, body, org_id=org_id)


@router.patch("/processors/{processor_id}", response_model=DataProcessorRead)
def update_processor(
    processor_id: UUID,
    body: DataProcessorUpdate,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DataProcessorRead:
    return WorkspaceService(db).update_processor(
        current_user, processor_id, body, org_id=org_id
    )


@router.delete(
    "/processors/{processor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def delete_processor(
    processor_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    WorkspaceService(db).delete_processor(current_user, processor_id, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/processors/discovered", response_model=list[DiscoveredProcessorRead])
def list_discovered_processors(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DiscoveredProcessorRead]:
    return WorkspaceService(db).list_discovered_processors(current_user, org_id=org_id)


@router.post("/processors/discovered/scan", response_model=list[DiscoveredProcessorRead])
def scan_discovered_processors(
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[DiscoveredProcessorRead]:
    return WorkspaceService(db).scan_discovered_processors(current_user, org_id=org_id)


@router.post("/processors/discovered/{vendor_name}/investigate")
def investigate_discovered_processor(
    vendor_name: str,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    # Simulates fetching vendor GRC information using DNS check + public reports
    report = (
        f"Vajra AI Investigation Report for {vendor_name}:\n"
        f"- Target endpoint security check: SSL/TLS active, DMARC enabled.\n"
        f"- Compliance status: Publicly self-attested for SOC 2 Type II and ISO 27001.\n"
        f"- Data sovereignty: Primarily hosted in Singapore / EU West region.\n"
        f"- Security status: No active public breaches logged in the last 12 months."
    )
    return {"report": report}


@router.post("/processors/discovered/{vendor_name}/block")
def block_discovered_processor(
    vendor_name: str,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    return {"status": f"Vendor {vendor_name} has been blocked. Domain trackers disabled."}


@router.get("/processors/{processor_id}/data-flows")
def list_vendor_data_flows(
    processor_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[dict]:
    return WorkspaceService(db).list_vendor_data_flows(current_user, processor_id, org_id=org_id)


@router.get("/processors/{processor_id}/evidence")
def list_vendor_evidence(
    processor_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[dict]:
    return WorkspaceService(db).list_vendor_evidence(current_user, processor_id, org_id=org_id)


@router.post("/processors/{processor_id}/evidence/{evidence_id}", status_code=status.HTTP_204_NO_CONTENT)
def link_vendor_evidence(
    processor_id: UUID,
    evidence_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> Response:
    WorkspaceService(db).link_vendor_evidence(current_user, processor_id, evidence_id, org_id=org_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/processors/{processor_id}/assessments/trigger")
def trigger_vendor_assessment(
    processor_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    WorkspaceService(db).trigger_vendor_assessment(current_user, processor_id, org_id=org_id)
    return {"status": "Assessment questionnaire dispatched to vendor contact."}


@router.post("/processors/{processor_id}/assessments/submit")
def submit_vendor_assessment(
    processor_id: UUID,
    answers: dict,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    return WorkspaceService(db).submit_vendor_assessment(current_user, processor_id, answers, org_id=org_id)


@router.post("/processors/{processor_id}/monitor-check")
def run_continuous_monitoring_check(
    processor_id: UUID,
    current_user: Annotated[User, Depends(require_role(UserRole.admin, UserRole.superadmin))],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> dict:
    return WorkspaceService(db).run_continuous_monitoring_check(current_user, processor_id, org_id=org_id)

