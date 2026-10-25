from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import (
    ActivityFeedItem,
    DashboardSummaryRead,
    DeadlineItem,
    ModuleHealthItem,
    OnboardingStatusRead,
    ProcessingTrendPoint,
    RiskHeatmapCell,
)
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummaryRead)
def get_dashboard_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> DashboardSummaryRead:
    return DashboardService(db).get_summary(current_user, org_id=org_id)


@router.get("/module-health", response_model=list[ModuleHealthItem])
def get_module_health(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[ModuleHealthItem]:
    return DashboardService(db).get_module_health(current_user, org_id=org_id)


@router.get("/activity-feed", response_model=list[ActivityFeedItem])
def get_activity_feed(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> list[ActivityFeedItem]:
    return DashboardService(db).get_activity_feed(
        current_user, org_id=org_id, limit=limit
    )


@router.get("/deadlines", response_model=list[DeadlineItem])
def get_deadlines(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=50),
) -> list[DeadlineItem]:
    return DashboardService(db).get_deadlines(current_user, org_id=org_id, limit=limit)


@router.get("/processing-trend", response_model=list[ProcessingTrendPoint])
def get_processing_trend(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
    months: int = Query(default=6, ge=1, le=24),
) -> list[ProcessingTrendPoint]:
    return DashboardService(db).get_processing_trend(
        current_user, org_id=org_id, months=months
    )


@router.get("/risk-heatmap", response_model=list[RiskHeatmapCell])
def get_risk_heatmap(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> list[RiskHeatmapCell]:
    return DashboardService(db).get_risk_heatmap(current_user, org_id=org_id)


@router.get("/onboarding-status", response_model=OnboardingStatusRead)
def get_onboarding_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> OnboardingStatusRead:
    return DashboardService(db).get_onboarding_status(current_user, org_id=org_id)
