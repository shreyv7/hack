"""Dashboard export in multiple formats."""

from __future__ import annotations

import base64
from uuid import UUID

from app.models.governance_dashboard import ExportFormat
from app.models.user import User
from app.schemas.governance_dashboard import DashboardDetailRead, ExportRequest, ExportResponse, MetricsQuery
from app.services.compliance_base import ComplianceBaseService
from app.services.governance_audit_service import GovernanceAuditService
from app.services.governance_dashboard_service import GovernanceDashboardService
from app.services.governance_export_renderers import render_export
from app.services.governance_metrics_service import GovernanceMetricsService


class GovernanceExportService(ComplianceBaseService):
    def _build_widget_payloads(
        self,
        user: User,
        dashboard: DashboardDetailRead,
    ) -> tuple[dict, list[dict]]:
        metrics_service = GovernanceMetricsService(self.db)
        filters = dashboard.filters_json or {}
        bu_id = filters.get("business_unit_id")
        if bu_id and isinstance(bu_id, str):
            bu_id = UUID(bu_id)
        property_id = filters.get("property_id")
        if property_id and isinstance(property_id, str):
            property_id = UUID(property_id)
        purpose_id = filters.get("purpose_id")
        if purpose_id and isinstance(purpose_id, str):
            purpose_id = UUID(purpose_id)

        widget_payloads: list[dict] = []
        for widget in sorted(dashboard.widgets, key=lambda w: w.sort_order):
            metrics = metrics_service.fetch_widget_metrics(
                user,
                MetricsQuery(
                    data_source=widget.data_source,
                    widget_type=widget.widget_type,
                    time_range=filters.get("time_range", "90d"),
                    business_unit_id=bu_id,
                    property_id=property_id,
                    purpose_id=purpose_id,
                    channel=filters.get("channel"),
                    journey_key=filters.get("journey_key"),
                ),
                org_id=dashboard.organization_id,
            )
            widget_payloads.append(
                {
                    "widget": {
                        "id": str(widget.id),
                        "title": widget.title,
                        "data_source": widget.data_source.value,
                        "widget_type": widget.widget_type.value,
                    },
                    "metrics": metrics.model_dump(),
                }
            )

        payload = {
            "dashboard": dashboard.model_dump(),
            "widgets": widget_payloads,
        }
        return payload, widget_payloads

    def export_dashboard_bytes(
        self,
        user: User,
        dashboard_id: UUID,
        fmt: ExportFormat,
        *,
        org_id: UUID | None = None,
        include_widgets: bool = True,
    ) -> tuple[bytes, str, str]:
        dashboard = GovernanceDashboardService(self.db).get_dashboard(user, dashboard_id, org_id=org_id)
        payload, widget_payloads = self._build_widget_payloads(user, dashboard)
        if not include_widgets:
            widget_payloads = []
            payload["widgets"] = []
        filters = dashboard.filters_json or {}
        return render_export(
            fmt,
            slug=dashboard.slug,
            dashboard_name=dashboard.name,
            description=dashboard.description,
            filters=filters,
            payload=payload,
            widget_payloads=widget_payloads,
        )

    def export_dashboard(
        self, user: User, dashboard_id: UUID, body: ExportRequest, *, org_id: UUID | None = None
    ) -> ExportResponse:
        dashboard = GovernanceDashboardService(self.db).get_dashboard(user, dashboard_id, org_id=org_id)
        payload, widget_payloads = self._build_widget_payloads(user, dashboard)
        if not body.include_widgets:
            widget_payloads = []
            payload["widgets"] = []
        filters = dashboard.filters_json or {}
        raw, filename, content_type = render_export(
            body.format,
            slug=dashboard.slug,
            dashboard_name=dashboard.name,
            description=dashboard.description,
            filters=filters,
            payload=payload,
            widget_payloads=widget_payloads,
        )
        GovernanceAuditService(self.db).log(
            organization_id=dashboard.organization_id,
            user=user,
            action="dashboard.exported",
            dashboard_id=dashboard.id,
            details={"format": body.format.value},
        )
        self.db.commit()
        return ExportResponse(
            format=body.format,
            filename=filename,
            content_type=content_type,
            data_base64=base64.b64encode(raw).decode(),
        )
