from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.dashboard import AutomationCoverageRead
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/overview", tags=["overview"])


@router.get("/automation-coverage", response_model=AutomationCoverageRead)
def get_automation_coverage(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Session = Depends(get_db),
    org_id: UUID | None = Query(default=None),
) -> AutomationCoverageRead:
    return DashboardService(db).get_automation_coverage(current_user, org_id=org_id)
