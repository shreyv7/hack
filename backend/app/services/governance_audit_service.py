"""Audit logging for governance dashboard actions."""

from uuid import UUID

from sqlalchemy.orm import Session

from app.models.governance_dashboard import GovernanceDashboardAudit
from app.models.user import User


class GovernanceAuditService:
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        *,
        organization_id: UUID,
        user: User | None,
        action: str,
        dashboard_id: UUID | None = None,
        details: dict | None = None,
    ) -> GovernanceDashboardAudit:
        entry = GovernanceDashboardAudit(
            dashboard_id=dashboard_id,
            organization_id=organization_id,
            user_id=user.id if user else None,
            action=action,
            details_json=details,
        )
        self.db.add(entry)
        self.db.flush()
        return entry

    def list_audits(
        self,
        organization_id: UUID,
        *,
        dashboard_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
    ) -> tuple[list[GovernanceDashboardAudit], int]:
        q = self.db.query(GovernanceDashboardAudit).filter(
            GovernanceDashboardAudit.organization_id == organization_id
        )
        if dashboard_id:
            q = q.filter(GovernanceDashboardAudit.dashboard_id == dashboard_id)
        if search:
            like = f"%{search.lower()}%"
            q = q.filter(GovernanceDashboardAudit.action.ilike(like))
        total = q.count()
        items = (
            q.order_by(GovernanceDashboardAudit.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return items, total
