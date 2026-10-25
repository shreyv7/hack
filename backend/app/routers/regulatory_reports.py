"""REST API for regulatory report packs (Req 9)."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.regulatory_report import (
    FrameworkCrosswalkResponse,
    RegulatoryReportCatalogItem,
    RegulatoryReportRequest,
    RegulatoryReportResponse,
)
from app.services.compliance_map_service import ComplianceMapService
from app.services.regulatory_report_service import CATALOG, RegulatoryReportService

router = APIRouter(prefix="/regulatory-reports", tags=["regulatory-reports"])


@router.get("/catalog", response_model=list[RegulatoryReportCatalogItem])
def list_report_catalog(
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[RegulatoryReportCatalogItem]:
    return CATALOG


@router.post("/generate", response_model=RegulatoryReportResponse)
def generate_report(
    body: RegulatoryReportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> RegulatoryReportResponse:
    service = RegulatoryReportService(db)
    content, content_type, filename = service.generate(
        current_user,
        body.report_key,
        body.format,
        body.filters,
        org_id=org_id,
    )
    return service.to_response(content, content_type, filename, body.report_key, body.format)


@router.get("/crosswalk", response_model=FrameworkCrosswalkResponse)
def get_framework_crosswalk(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    framework: str = Query(..., description="rbi | iso27001 | nist"),
    org_id: UUID | None = Query(default=None),
) -> FrameworkCrosswalkResponse:
    data = ComplianceMapService(db).get_crosswalk(current_user, framework, org_id=org_id)
    return FrameworkCrosswalkResponse.model_validate(data)
