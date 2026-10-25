"""Dashboard CRUD, widgets, layout, versioning, and permissions."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_password
from app.models.governance_dashboard import (
    DashboardPermission,
    DashboardVisibility,
    GovernanceDashboard,
    GovernanceDashboardFavorite,
    GovernanceDashboardShare,
    GovernanceDashboardVersion,
    GovernanceWidget,
)
from app.models.user import User, UserRole
from app.schemas.governance_dashboard import (
    DashboardCreate,
    DashboardDetailRead,
    DashboardLayoutUpdate,
    DashboardRead,
    DashboardUpdate,
    PaginatedDashboards,
    WidgetCreate,
    WidgetRead,
    WidgetUpdate,
)
from app.services.compliance_base import ComplianceBaseService
from app.services.governance_audit_service import GovernanceAuditService
from app.services.governance_template_service import GovernanceTemplateService
from app.utils.text import slugify


class GovernanceDashboardService(ComplianceBaseService):
    def _audit(self) -> GovernanceAuditService:
        return GovernanceAuditService(self.db)

    def _share_active_filter(self):
        now = datetime.now(timezone.utc)
        return or_(
            GovernanceDashboardShare.expires_at.is_(None),
            GovernanceDashboardShare.expires_at > now,
        )

    def _can_view(self, user: User, dashboard: GovernanceDashboard) -> bool:
        if dashboard.deleted_at is not None:
            return False
        if user.role == UserRole.superadmin:
            return True
        if dashboard.organization_id != user.organization_id:
            return False
        if dashboard.owner_user_id == user.id:
            return True
        if dashboard.visibility in (DashboardVisibility.workspace, DashboardVisibility.organization):
            return True
        share = (
            self.db.query(GovernanceDashboardShare)
            .filter(
                GovernanceDashboardShare.dashboard_id == dashboard.id,
                self._share_active_filter(),
                or_(
                    GovernanceDashboardShare.shared_with_user_id == user.id,
                    GovernanceDashboardShare.shared_with_role == user.role.value,
                ),
            )
            .first()
        )
        return share is not None

    def _can_edit(self, user: User, dashboard: GovernanceDashboard) -> bool:
        if dashboard.deleted_at is not None:
            return False
        if user.role == UserRole.superadmin:
            return True
        if user.role == UserRole.admin and dashboard.owner_user_id == user.id:
            return True
        share = (
            self.db.query(GovernanceDashboardShare)
            .filter(
                GovernanceDashboardShare.dashboard_id == dashboard.id,
                self._share_active_filter(),
                GovernanceDashboardShare.shared_with_user_id == user.id,
                GovernanceDashboardShare.permission.in_([DashboardPermission.editor, DashboardPermission.owner]),
            )
            .first()
        )
        return share is not None

    def _get_dashboard_or_404(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> GovernanceDashboard:
        resolved_org = self._resolve_org_id(user, org_id)
        dashboard = (
            self.db.query(GovernanceDashboard)
            .options(joinedload(GovernanceDashboard.widgets))
            .filter(
                GovernanceDashboard.id == dashboard_id,
                GovernanceDashboard.organization_id == resolved_org,
                GovernanceDashboard.deleted_at.is_(None),
            )
            .first()
        )
        if dashboard is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Dashboard not found")
        if not self._can_view(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Access denied")
        return dashboard

    def _unique_slug(self, org_id: UUID, name: str, exclude_id: UUID | None = None) -> str:
        base = slugify(name) or "dashboard"
        slug = base
        n = 2
        while True:
            q = self.db.query(GovernanceDashboard).filter(
                GovernanceDashboard.organization_id == org_id,
                GovernanceDashboard.slug == slug,
                GovernanceDashboard.deleted_at.is_(None),
            )
            if exclude_id:
                q = q.filter(GovernanceDashboard.id != exclude_id)
            if q.first() is None:
                return slug
            slug = f"{base}-{n}"
            n += 1

    def _to_read(self, dashboard: GovernanceDashboard, user: User) -> DashboardRead:
        fav = (
            self.db.query(GovernanceDashboardFavorite)
            .filter(
                GovernanceDashboardFavorite.dashboard_id == dashboard.id,
                GovernanceDashboardFavorite.user_id == user.id,
            )
            .first()
            is not None
        )
        owner_name = dashboard.owner.full_name if dashboard.owner else None
        widget_count = len([w for w in dashboard.widgets if w.deleted_at is None]) if dashboard.widgets else 0
        return DashboardRead(
            id=dashboard.id,
            organization_id=dashboard.organization_id,
            owner_user_id=dashboard.owner_user_id,
            owner_name=owner_name,
            name=dashboard.name,
            description=dashboard.description,
            slug=dashboard.slug,
            visibility=dashboard.visibility,
            is_template=dashboard.is_template,
            template_key=dashboard.template_key,
            is_pinned=dashboard.is_pinned,
            is_favourite=fav,
            layout_json=dashboard.layout_json or {},
            filters_json=dashboard.filters_json or {},
            auto_refresh_seconds=dashboard.auto_refresh_seconds,
            version=dashboard.version,
            last_refreshed_at=dashboard.last_refreshed_at,
            widget_count=widget_count,
            created_at=dashboard.created_at,
            updated_at=dashboard.updated_at,
        )

    def _to_detail(self, dashboard: GovernanceDashboard, user: User) -> DashboardDetailRead:
        base = self._to_read(dashboard, user)
        widgets = [
            WidgetRead.model_validate(w)
            for w in sorted(dashboard.widgets, key=lambda x: x.sort_order)
            if w.deleted_at is None
        ]
        return DashboardDetailRead(**base.model_dump(), widgets=widgets)

    def _save_version(self, dashboard: GovernanceDashboard, user: User) -> None:
        snapshot = {
            "dashboard": {
                "name": dashboard.name,
                "description": dashboard.description,
                "layout_json": dashboard.layout_json,
                "filters_json": dashboard.filters_json,
            },
            "widgets": [
                {
                    "widget_type": w.widget_type.value,
                    "data_source": w.data_source.value,
                    "title": w.title,
                    "config_json": w.config_json,
                    "layout_json": w.layout_json,
                    "sort_order": w.sort_order,
                }
                for w in dashboard.widgets
                if w.deleted_at is None
            ],
        }
        self.db.add(
            GovernanceDashboardVersion(
                dashboard_id=dashboard.id,
                version_number=dashboard.version,
                snapshot_json=snapshot,
                created_by_user_id=user.id,
            )
        )

    def _add_widgets(self, dashboard: GovernanceDashboard, widgets: list[WidgetCreate]) -> None:
        for idx, spec in enumerate(widgets):
            config = spec.config_json.model_dump() if hasattr(spec.config_json, "model_dump") else dict(spec.config_json or {})
            layout = spec.layout_json.model_dump() if hasattr(spec.layout_json, "model_dump") else dict(spec.layout_json or {})
            self.db.add(
                GovernanceWidget(
                    dashboard_id=dashboard.id,
                    widget_type=spec.widget_type,
                    data_source=spec.data_source,
                    title=spec.title,
                    config_json=config,
                    layout_json=layout,
                    sort_order=spec.sort_order or idx,
                )
            )

    def ensure_default_dashboards(self, user: User, *, org_id: UUID | None = None) -> None:
        resolved_org = self._resolve_org_id(user, org_id)
        existing = (
            self.db.query(GovernanceDashboard)
            .filter(
                GovernanceDashboard.organization_id == resolved_org,
                GovernanceDashboard.deleted_at.is_(None),
                GovernanceDashboard.is_template.is_(False),
            )
            .count()
        )
        if existing > 0:
            return
        template = GovernanceTemplateService().get_template("executive-summary")
        if not template:
            return
        self.create_dashboard(
            user,
            DashboardCreate(
                name="Executive Summary",
                description=template.description,
                template_key=template.key,
                is_pinned=True,
                widgets=template.widgets,
            ),
            org_id=resolved_org,
        )

    def list_dashboards(
        self,
        user: User,
        *,
        org_id: UUID | None = None,
        page: int = 1,
        page_size: int = 20,
        search: str | None = None,
        pinned_only: bool = False,
        sort: str = "updated_at",
    ) -> PaginatedDashboards:
        resolved_org = self._resolve_org_id(user, org_id)
        self.ensure_default_dashboards(user, org_id=resolved_org)
        q = self.db.query(GovernanceDashboard).filter(
            GovernanceDashboard.organization_id == resolved_org,
            GovernanceDashboard.deleted_at.is_(None),
            GovernanceDashboard.is_template.is_(False),
        )
        if pinned_only:
            q = q.filter(GovernanceDashboard.is_pinned.is_(True))
        if search:
            like = f"%{search.lower()}%"
            q = q.filter(
                or_(
                    func.lower(GovernanceDashboard.name).like(like),
                    func.lower(GovernanceDashboard.description).like(like),
                )
            )
        sort_col = {
            "name": GovernanceDashboard.name,
            "created_at": GovernanceDashboard.created_at,
            "updated_at": GovernanceDashboard.updated_at,
        }.get(sort, GovernanceDashboard.updated_at)
        total = q.count()
        dashboards = (
            q.options(joinedload(GovernanceDashboard.owner), joinedload(GovernanceDashboard.widgets))
            .order_by(sort_col.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        visible = [d for d in dashboards if self._can_view(user, d)]
        pages = max(1, (total + page_size - 1) // page_size)
        return PaginatedDashboards(
            items=[self._to_read(d, user) for d in visible],
            total=total,
            page=page,
            page_size=page_size,
            pages=pages,
        )

    def get_dashboard(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> DashboardDetailRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        dashboard.last_refreshed_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(dashboard)
        return self._to_detail(dashboard, user)

    def create_dashboard(self, user: User, body: DashboardCreate, *, org_id: UUID | None = None) -> DashboardDetailRead:
        resolved_org = self._resolve_org_id(user, org_id)
        widgets = list(body.widgets)
        if body.template_key and not widgets:
            template = GovernanceTemplateService().get_template(body.template_key)
            if template:
                widgets = template.widgets
        slug = self._unique_slug(resolved_org, body.name)
        filters = body.filters_json.model_dump() if hasattr(body.filters_json, "model_dump") else dict(body.filters_json or {})
        dashboard = GovernanceDashboard(
            organization_id=resolved_org,
            owner_user_id=user.id,
            name=body.name,
            description=body.description,
            slug=slug,
            visibility=body.visibility,
            template_key=body.template_key,
            is_pinned=body.is_pinned,
            filters_json=filters,
            auto_refresh_seconds=body.auto_refresh_seconds,
            layout_json={"columns": 12},
        )
        self.db.add(dashboard)
        self.db.flush()
        self._add_widgets(dashboard, widgets)
        self._audit().log(
            organization_id=resolved_org,
            user=user,
            action="dashboard.created",
            dashboard_id=dashboard.id,
            details={"name": dashboard.name},
        )
        self.db.commit()
        self.db.refresh(dashboard)
        return self._to_detail(dashboard, user)

    def update_dashboard(
        self, user: User, dashboard_id: UUID, body: DashboardUpdate, *, org_id: UUID | None = None
    ) -> DashboardDetailRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        if body.name is not None:
            dashboard.name = body.name
            dashboard.slug = self._unique_slug(dashboard.organization_id, body.name, exclude_id=dashboard.id)
        if body.description is not None:
            dashboard.description = body.description
        if body.visibility is not None:
            dashboard.visibility = body.visibility
        if body.is_pinned is not None:
            dashboard.is_pinned = body.is_pinned
        if body.filters_json is not None:
            dashboard.filters_json = body.filters_json
        if body.auto_refresh_seconds is not None:
            dashboard.auto_refresh_seconds = body.auto_refresh_seconds
        if body.layout_json is not None:
            dashboard.layout_json = body.layout_json
        dashboard.version += 1
        self._save_version(dashboard, user)
        self._audit().log(
            organization_id=dashboard.organization_id,
            user=user,
            action="dashboard.updated",
            dashboard_id=dashboard.id,
        )
        self.db.commit()
        self.db.refresh(dashboard)
        return self._to_detail(dashboard, user)

    def delete_dashboard(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> None:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard) and dashboard.owner_user_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Delete access required")
        dashboard.deleted_at = datetime.now(timezone.utc)
        self._audit().log(
            organization_id=dashboard.organization_id,
            user=user,
            action="dashboard.deleted",
            dashboard_id=dashboard.id,
        )
        self.db.commit()

    def clone_dashboard(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> DashboardDetailRead:
        source = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        widgets = [
            WidgetCreate(
                widget_type=w.widget_type,
                data_source=w.data_source,
                title=w.title,
                config_json=w.config_json or {},
                layout_json=w.layout_json or {},
                sort_order=w.sort_order,
            )
            for w in source.widgets
            if w.deleted_at is None
        ]
        return self.create_dashboard(
            user,
            DashboardCreate(
                name=f"{source.name} (Copy)",
                description=source.description,
                visibility=DashboardVisibility.private,
                filters_json=source.filters_json or {},
                auto_refresh_seconds=source.auto_refresh_seconds,
                widgets=widgets,
            ),
            org_id=source.organization_id,
        )

    def update_layout(
        self, user: User, dashboard_id: UUID, body: DashboardLayoutUpdate, *, org_id: UUID | None = None
    ) -> DashboardDetailRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        dashboard.layout_json = body.layout_json
        widget_map = {str(w.id): w for w in dashboard.widgets if w.deleted_at is None}
        for item in body.widgets:
            wid = item.get("id")
            if wid and str(wid) in widget_map:
                widget = widget_map[str(wid)]
                if "layout_json" in item:
                    widget.layout_json = item["layout_json"]
                if "sort_order" in item:
                    widget.sort_order = int(item["sort_order"])
        dashboard.version += 1
        self._save_version(dashboard, user)
        self.db.commit()
        self.db.refresh(dashboard)
        return self._to_detail(dashboard, user)

    def toggle_favourite(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None) -> DashboardRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        fav = (
            self.db.query(GovernanceDashboardFavorite)
            .filter(
                GovernanceDashboardFavorite.dashboard_id == dashboard.id,
                GovernanceDashboardFavorite.user_id == user.id,
            )
            .first()
        )
        if fav:
            self.db.delete(fav)
        else:
            self.db.add(GovernanceDashboardFavorite(user_id=user.id, dashboard_id=dashboard.id))
        self.db.commit()
        return self._to_read(dashboard, user)

    def add_widget(
        self, user: User, dashboard_id: UUID, body: WidgetCreate, *, org_id: UUID | None = None
    ) -> WidgetRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        config = body.config_json.model_dump() if hasattr(body.config_json, "model_dump") else dict(body.config_json or {})
        layout = body.layout_json.model_dump() if hasattr(body.layout_json, "model_dump") else dict(body.layout_json or {})
        widget = GovernanceWidget(
            dashboard_id=dashboard.id,
            widget_type=body.widget_type,
            data_source=body.data_source,
            title=body.title,
            config_json=config,
            layout_json=layout,
            sort_order=body.sort_order,
        )
        self.db.add(widget)
        dashboard.version += 1
        self.db.commit()
        self.db.refresh(widget)
        return WidgetRead.model_validate(widget)

    def update_widget(
        self, user: User, dashboard_id: UUID, widget_id: UUID, body: WidgetUpdate, *, org_id: UUID | None = None
    ) -> WidgetRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        widget = next((w for w in dashboard.widgets if w.id == widget_id and w.deleted_at is None), None)
        if widget is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found")
        if body.title is not None:
            widget.title = body.title
        if body.config_json is not None:
            widget.config_json = body.config_json
        if body.layout_json is not None:
            widget.layout_json = body.layout_json
        if body.sort_order is not None:
            widget.sort_order = body.sort_order
        dashboard.version += 1
        self.db.commit()
        self.db.refresh(widget)
        return WidgetRead.model_validate(widget)

    def duplicate_widget(
        self, user: User, dashboard_id: UUID, widget_id: UUID, *, org_id: UUID | None = None
    ) -> WidgetRead:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        source = next((w for w in dashboard.widgets if w.id == widget_id and w.deleted_at is None), None)
        if source is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found")
        return self.add_widget(
            user,
            dashboard_id,
            WidgetCreate(
                widget_type=source.widget_type,
                data_source=source.data_source,
                title=f"{source.title} (Copy)",
                config_json=source.config_json or {},
                layout_json=source.layout_json or {},
                sort_order=source.sort_order + 1,
            ),
            org_id=org_id,
        )

    def delete_widget(self, user: User, dashboard_id: UUID, widget_id: UUID, *, org_id: UUID | None = None) -> None:
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        if not self._can_edit(user, dashboard):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Edit access required")
        widget = next((w for w in dashboard.widgets if w.id == widget_id and w.deleted_at is None), None)
        if widget is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Widget not found")
        widget.deleted_at = datetime.now(timezone.utc)
        dashboard.version += 1
        self.db.commit()

    def list_versions(self, user: User, dashboard_id: UUID, *, org_id: UUID | None = None):
        dashboard = self._get_dashboard_or_404(user, dashboard_id, org_id=org_id)
        from app.schemas.governance_dashboard import DashboardVersionRead

        versions = (
            self.db.query(GovernanceDashboardVersion)
            .filter(GovernanceDashboardVersion.dashboard_id == dashboard.id)
            .order_by(GovernanceDashboardVersion.version_number.desc())
            .all()
        )
        return [
            DashboardVersionRead(
                id=v.id,
                dashboard_id=v.dashboard_id,
                version_number=v.version_number,
                created_by_user_id=v.created_by_user_id,
                created_by_name=v.created_by.full_name if v.created_by else None,
                created_at=v.created_at,
            )
            for v in versions
        ]
