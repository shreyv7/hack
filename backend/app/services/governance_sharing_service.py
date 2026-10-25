"""Dashboard sharing and public link management."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models.governance_dashboard import DashboardPermission, GovernanceDashboard, GovernanceDashboardShare
from app.models.user import User, UserRole
from app.schemas.governance_dashboard import (
    MetricsQuery,
    PublicDashboardRead,
    PublicLinkCreate,
    PublicLinkRead,
    ShareCreate,
    ShareRead,
    WidgetMetricsResponse,
    WidgetRead,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.governance_audit_service import GovernanceAuditService
from app.services.governance_dashboard_service import GovernanceDashboardService
from app.services.governance_metrics_service import GovernanceMetricsService


def _share_not_expired(now: datetime):
    from sqlalchemy import or_

    return or_(
        GovernanceDashboardShare.expires_at.is_(None),
        GovernanceDashboardShare.expires_at > now,
    )


class GovernanceSharingService(ComplianceBaseService):
    def _validate_share_target(self, body: ShareCreate) -> None:
        has_user = body.shared_with_user_id is not None
        has_role = bool(body.shared_with_role and body.shared_with_role.strip())
        if has_user == has_role:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Provide exactly one of shared_with_user_id or shared_with_role",
            )

    def _find_duplicate_share(
        self, dashboard_id: UUID, body: ShareCreate
    ) -> GovernanceDashboardShare | None:
        q = self.db.query(GovernanceDashboardShare).filter(
            GovernanceDashboardShare.dashboard_id == dashboard_id,
            GovernanceDashboardShare.public_token.is_(None),
        )
        if body.shared_with_user_id:
            q = q.filter(GovernanceDashboardShare.shared_with_user_id == body.shared_with_user_id)
        else:
            q = q.filter(GovernanceDashboardShare.shared_with_role == body.shared_with_role)
        return q.first()

    def list_shares(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> list[ShareRead]:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manage access required")
        shares = (
            self.db.query(GovernanceDashboardShare)
            .filter(GovernanceDashboardShare.dashboard_id == dashboard.id)
            .order_by(GovernanceDashboardShare.created_at.desc())
            .all()
        )
        return [self._to_share_read(s) for s in shares]

    def _to_share_read(self, share: GovernanceDashboardShare) -> ShareRead:
        return ShareRead(
            id=share.id,
            dashboard_id=share.dashboard_id,
            shared_with_user_id=share.shared_with_user_id,
            shared_with_user_name=share.shared_with_user.full_name if share.shared_with_user else None,
            shared_with_role=share.shared_with_role,
            permission=share.permission,
            public_token=share.public_token,
            expires_at=share.expires_at,
            created_at=share.created_at,
        )

    def add_share(self, user: User, dashboard_id: UUID, body: ShareCreate, *, org_id: UUID | None = None) -> ShareRead:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manage access required")
        self._validate_share_target(body)
        if self._find_duplicate_share(dashboard.id, body):
            raise HTTPException(status.HTTP_409_CONFLICT, detail="Share already exists for this user or role")
        share = GovernanceDashboardShare(
            dashboard_id=dashboard.id,
            shared_with_user_id=body.shared_with_user_id,
            shared_with_role=body.shared_with_role.strip() if body.shared_with_role else None,
            permission=body.permission,
            expires_at=body.expires_at,
            password_hash=hash_password(body.password) if body.password else None,
        )
        self.db.add(share)
        GovernanceAuditService(self.db).log(
            organization_id=dashboard.organization_id,
            user=user,
            action="dashboard.shared",
            dashboard_id=dashboard.id,
            details={"permission": body.permission.value},
        )
        self.db.commit()
        self.db.refresh(share)
        return self._to_share_read(share)

    def remove_share(self, user: User, dashboard_id: UUID, share_id: UUID, *, org_id: UUID | None = None) -> None:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manage access required")
        share = (
            self.db.query(GovernanceDashboardShare)
            .filter(GovernanceDashboardShare.id == share_id, GovernanceDashboardShare.dashboard_id == dashboard.id)
            .first()
        )
        if share is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Share not found")
        self.db.delete(share)
        self.db.commit()

    def create_public_link(
        self, user: User, dashboard_id: UUID, body: PublicLinkCreate, *, org_id: UUID | None = None
    ) -> PublicLinkRead:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manage access required")
        token = secrets.token_urlsafe(24)
        share = GovernanceDashboardShare(
            dashboard_id=dashboard.id,
            permission=body.permission,
            public_token=token,
            expires_at=body.expires_at,
            password_hash=hash_password(body.password) if body.password else None,
        )
        self.db.add(share)
        self.db.commit()
        base = settings.FRONTEND_URL.rstrip("/")
        return PublicLinkRead(
            public_token=token,
            public_url=f"{base}/compliance/dashboards/public/{token}",
            expires_at=body.expires_at,
        )

    def revoke_public_link(
        self, user: User, dashboard_id: UUID, share_id: UUID, *, org_id: UUID | None = None
    ) -> None:
        dashboard = GovernanceDashboardService(self.db)._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not GovernanceDashboardService(self.db)._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Manage access required")
        share = (
            self.db.query(GovernanceDashboardShare)
            .filter(
                GovernanceDashboardShare.id == share_id,
                GovernanceDashboardShare.dashboard_id == dashboard.id,
                GovernanceDashboardShare.public_token.isnot(None),
            )
            .first()
        )
        if share is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Public link not found")
        self.db.delete(share)
        self.db.commit()

    def _resolve_public_share(self, token: str, password: str | None) -> GovernanceDashboardShare:
        now = datetime.now(timezone.utc)
        share = (
            self.db.query(GovernanceDashboardShare)
            .options(joinedload(GovernanceDashboardShare.dashboard).joinedload(GovernanceDashboard.widgets))
            .filter(
                GovernanceDashboardShare.public_token == token,
                _share_not_expired(now),
            )
            .first()
        )
        if share is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Public link not found or expired")
        if share.password_hash:
            if not password or not verify_password(password, share.password_hash):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Password required")
        dashboard = share.dashboard
        if dashboard is None or dashboard.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
        return share

    def _acting_user_for_dashboard(self, dashboard: GovernanceDashboard) -> User:
        if dashboard.owner_user_id:
            owner = self.db.get(User, dashboard.owner_user_id)
            if owner is not None:
                return owner
        admin = (
            self.db.query(User)
            .filter(
                User.organization_id == dashboard.organization_id,
                User.role.in_([UserRole.admin, UserRole.superadmin]),
            )
            .first()
        )
        if admin is None:
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No user available for public view")
        return admin

    def get_public_dashboard(self, token: str, password: str | None = None) -> PublicDashboardRead:
        share = self._resolve_public_share(token, password)
        dashboard = share.dashboard
        acting_user = self._acting_user_for_dashboard(dashboard)
        detail = GovernanceDashboardService(self.db)._to_detail(dashboard, acting_user)
        filters = dashboard.filters_json or {}
        bu_id = filters.get("business_unit_id")
        if bu_id and isinstance(bu_id, str):
            bu_id = UUID(bu_id)

        metrics_service = GovernanceMetricsService(self.db)
        widget_metrics: list[WidgetMetricsResponse] = []
        for widget in detail.widgets:
            metrics = metrics_service.fetch_widget_metrics(
                acting_user,
                MetricsQuery(
                    data_source=widget.data_source,
                    widget_type=widget.widget_type,
                    time_range=filters.get("time_range", "90d"),
                    business_unit_id=bu_id,
                ),
                org_id=dashboard.organization_id,
            )
            widget_metrics.append(metrics)

        return PublicDashboardRead(
            dashboard_name=detail.name,
            dashboard_description=detail.description,
            filters_json=detail.filters_json,
            widgets=[WidgetRead.model_validate(w) for w in detail.widgets],
            widget_metrics=widget_metrics,
            requires_password=share.password_hash is not None,
            expires_at=share.expires_at,
        )
