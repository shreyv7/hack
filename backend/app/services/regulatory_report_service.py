"""Regulatory report pack orchestrator — composes existing module data (Req 9)."""

from __future__ import annotations

import base64
import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.models.consent_receipt import ConsentReceipt
from app.models.organization import Organization
from app.models.user import User
from app.schemas.regulatory_report import ReportFilters, RegulatoryReportCatalogItem
from app.services.compliance_base import ComplianceBaseService
from app.services.compliance_map_service import ComplianceMapService
from app.services.dashboard_service import DashboardService
from app.services.dsar_service import DsarService
from app.services.governance_metrics_service import GovernanceMetricsService
from app.services.retention_service import RetentionService
from app.services.ropa_service import RopaService


CATALOG: list[RegulatoryReportCatalogItem] = [
    RegulatoryReportCatalogItem(
        key="consent_proof",
        name="Consent Proof Report",
        description="Consent receipts with proof vault hash and DPDPA §6 references.",
        formats=["xlsx", "json"],
        dpdpa_sections=["§6", "§6(10)"],
    ),
    RegulatoryReportCatalogItem(
        key="consent_status",
        name="Consent Status Summary",
        description="Channel/purpose consent rate summary for regulator filing.",
        formats=["pdf", "json"],
        dpdpa_sections=["§5", "§6"],
    ),
    RegulatoryReportCatalogItem(
        key="data_rights",
        name="Data Principal Rights Report",
        description="DSAR SLA performance and open request queue.",
        formats=["pdf", "json"],
        dpdpa_sections=["§11", "§12", "§13", "§14"],
    ),
    RegulatoryReportCatalogItem(
        key="ropa_register",
        name="RoPA Register Export",
        description="Processing activity register with banking context and retention links.",
        formats=["pdf", "xlsx", "json"],
        dpdpa_sections=["§10", "Rules 4-5"],
    ),
    RegulatoryReportCatalogItem(
        key="dpia_portfolio",
        name="DPIA Portfolio Summary",
        description="High-risk assessment counts and pending reviews.",
        formats=["pdf", "json"],
        dpdpa_sections=["§10"],
    ),
    RegulatoryReportCatalogItem(
        key="retention_actions",
        name="Retention Actions Report",
        description="Storage limitation actions and obligation status (§8(7)).",
        formats=["pdf", "xlsx", "json"],
        dpdpa_sections=["§8(5)", "§8(7)"],
    ),
    RegulatoryReportCatalogItem(
        key="compliance_gaps",
        name="DPDPA Compliance Gaps",
        description="Section-level gap analysis with penalty exposure.",
        formats=["pdf", "json"],
        dpdpa_sections=["Schedule"],
    ),
    RegulatoryReportCatalogItem(
        key="fino_regulatory_pack",
        name="Fino Regulatory Pack (ZIP)",
        description="Bundle of all regulatory reports for RBI/DPDPA filing.",
        formats=["zip"],
        dpdpa_sections=["§5-§14", "§10", "Schedule"],
    ),
]


class RegulatoryReportService(ComplianceBaseService):
    def list_catalog(self) -> list[RegulatoryReportCatalogItem]:
        return CATALOG

    def generate(
        self,
        user: User,
        report_key: str,
        fmt: str,
        filters: ReportFilters,
        *,
        org_id: UUID | None = None,
    ) -> tuple[bytes, str, str]:
        resolved = self._resolve_org_id(user, org_id)
        item = next((c for c in CATALOG if c.key == report_key), None)
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Unknown report key")
        if fmt not in item.formats:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Format {fmt} not supported for {report_key}")

        if report_key == "fino_regulatory_pack":
            return self._generate_pack(user, resolved, filters)

        generators = {
            "consent_proof": self._consent_proof,
            "consent_status": self._consent_status,
            "data_rights": self._data_rights,
            "ropa_register": self._ropa_register,
            "dpia_portfolio": self._dpia_portfolio,
            "retention_actions": self._retention_actions,
            "compliance_gaps": self._compliance_gaps,
        }
        data, filename_stem = generators[report_key](user, resolved, filters)
        content, content_type, ext = self._render(fmt, filename_stem, data, user, resolved)
        return content, content_type, f"{filename_stem}.{ext}"

    def _cover_sheet(self, user: User, org_id: UUID) -> dict[str, Any]:
        org = self.db.query(Organization).filter(Organization.id == org_id).first()
        summary = ComplianceMapService(self.db).get_summary(user, org_id=org_id)
        dash = DashboardService(self.db).get_summary(user, org_id=org_id)
        return {
            "org_name": org.name if org else "Organization",
            "report_date": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "compliance_score": summary.compliance_score,
            "compliance_status": dash.compliance_status,
            "penalty_mitigated_crores": summary.penalty_mitigated_crores,
            "penalty_worst_crores": summary.penalty_worst_crores,
            "dpdpa_applicability": "Primary framework — DPDPA 2023 with crosswalk overlays for RBI/ISO/NIST",
        }

    def _metrics_query(self, filters: ReportFilters):
        from app.schemas.governance_dashboard import MetricsQuery
        from app.models.governance_dashboard import WidgetDataSource

        return MetricsQuery(
            data_source=WidgetDataSource.consent,
            time_range=filters.time_range,
            business_unit_id=filters.business_unit_id,
            property_id=filters.property_id,
            purpose_id=filters.purpose_id,
            channel=filters.channel,
            journey_key=filters.journey_key,
        )

    def _consent_proof(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        q = self.db.query(ConsentReceipt).filter(ConsentReceipt.organization_id == org_id)
        cutoff = GovernanceMetricsService._time_cutoff(filters.time_range)
        if cutoff:
            q = q.filter(ConsentReceipt.created_at >= cutoff)
        if filters.property_id:
            q = q.filter(ConsentReceipt.property_id == filters.property_id)
        if filters.channel:
            q = q.filter(ConsentReceipt.capture_channel == filters.channel)
        if filters.journey_key:
            q = q.filter(ConsentReceipt.journey_key == filters.journey_key)
        receipts = q.order_by(ConsentReceipt.created_at.desc()).limit(5000).all()
        rows = []
        for r in receipts:
            rows.append(
                {
                    "receipt_id": str(r.id),
                    "session_id": r.session_id,
                    "property_id": str(r.property_id) if r.property_id else None,
                    "capture_channel": r.capture_channel,
                    "journey_key": r.journey_key,
                    "consented_purposes": r.consented_purposes,
                    "proof_vault_record_id": str(r.proof_vault_record_id) if r.proof_vault_record_id else None,
                    "proof_hash": r.signature,
                    "dpdpa_ref": "§6(3), §6(10)",
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
            )
        return {"cover": self._cover_sheet(user, org_id), "rows": rows, "total": len(rows)}, "consent_proof"

    def _consent_status(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        from app.models.governance_dashboard import WidgetDataSource
        from app.schemas.governance_dashboard import MetricsQuery

        metrics = GovernanceMetricsService(self.db).fetch_widget_metrics(
            user,
            MetricsQuery(
                data_source=WidgetDataSource.consent,
                time_range=filters.time_range,
                business_unit_id=filters.business_unit_id,
                property_id=filters.property_id,
                purpose_id=filters.purpose_id,
                channel=filters.channel,
                journey_key=filters.journey_key,
            ),
            org_id=org_id,
        )
        return {
            "cover": self._cover_sheet(user, org_id),
            "metrics": metrics.data,
            "filters": filters.model_dump(),
        }, "consent_status"

    def _data_rights(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        since = GovernanceMetricsService._time_cutoff(filters.time_range)
        dash = DsarService(self.db).get_dashboard(
            user, org_id=org_id, business_unit_id=filters.business_unit_id, since=since
        )
        return {
            "cover": self._cover_sheet(user, org_id),
            "metrics": dash.metrics.model_dump(),
            "requests": [r.model_dump() for r in dash.requests[:100]],
            "filters": filters.model_dump(),
        }, "data_rights"

    def _ropa_register(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        content, _ = RopaService(self.db).export_register_bytes(
            user,
            org_id=org_id,
            fmt="json",
            purpose_id=filters.purpose_id,
            channel=filters.channel,
            business_unit_id=filters.business_unit_id,
        )
        payload = json.loads(content.decode())
        payload["cover"] = self._cover_sheet(user, org_id)
        return payload, "ropa_register"

    def _dpia_portfolio(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        from app.models.governance_dashboard import WidgetDataSource
        from app.schemas.governance_dashboard import MetricsQuery

        metrics = GovernanceMetricsService(self.db).fetch_widget_metrics(
            user,
            MetricsQuery(
                data_source=WidgetDataSource.dpia,
                time_range=filters.time_range,
                business_unit_id=filters.business_unit_id,
            ),
            org_id=org_id,
        )
        return {"cover": self._cover_sheet(user, org_id), "portfolio": metrics.data}, "dpia_portfolio"

    def _retention_actions(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        from app.models.governance_dashboard import WidgetDataSource
        from app.schemas.governance_dashboard import MetricsQuery

        metrics = GovernanceMetricsService(self.db).fetch_widget_metrics(
            user,
            MetricsQuery(data_source=WidgetDataSource.retention, time_range=filters.time_range),
            org_id=org_id,
        )
        runs = RetentionService(self.db).list_runs(user, org_id=org_id)[:50]
        return {
            "cover": self._cover_sheet(user, org_id),
            "summary": metrics.data,
            "recent_runs": [r.model_dump() for r in runs],
        }, "retention_actions"

    def _compliance_gaps(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[dict, str]:
        summary = ComplianceMapService(self.db).get_summary(user, org_id=org_id)
        chapters = ComplianceMapService(self.db).get_chapters(user, org_id=org_id)
        health = DashboardService(self.db).get_module_health(user, org_id=org_id)
        return {
            "cover": self._cover_sheet(user, org_id),
            "summary": summary.model_dump(),
            "chapters": [c.model_dump() for c in chapters],
            "module_health": [h.model_dump() for h in health],
        }, "compliance_gaps"

    def _generate_pack(self, user: User, org_id: UUID, filters: ReportFilters) -> tuple[bytes, str, str]:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            sub_reports = [
                ("consent_proof", "xlsx"),
                ("consent_status", "pdf"),
                ("data_rights", "pdf"),
                ("ropa_register", "xlsx"),
                ("retention_actions", "pdf"),
                ("compliance_gaps", "pdf"),
            ]
            for key, fmt in sub_reports:
                generators = {
                    "consent_proof": self._consent_proof,
                    "consent_status": self._consent_status,
                    "data_rights": self._data_rights,
                    "ropa_register": self._ropa_register,
                    "retention_actions": self._retention_actions,
                    "compliance_gaps": self._compliance_gaps,
                }
                data, stem = generators[key](user, org_id, filters)
                content, _, ext = self._render(fmt, stem, data, user, org_id)
                zf.writestr(f"{stem}.{ext}", content)
            cover = json.dumps(self._cover_sheet(user, org_id), indent=2).encode()
            zf.writestr("cover_sheet.json", cover)
        buffer.seek(0)
        return buffer.read(), "application/zip", "fino_regulatory_pack.zip"

    def _render(
        self, fmt: str, stem: str, data: dict, user: User, org_id: UUID
    ) -> tuple[bytes, str, str]:
        if fmt == "json":
            return json.dumps(data, default=str, indent=2).encode(), "application/json", "json"
        if fmt == "xlsx":
            return self._render_xlsx(stem, data), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"
        if fmt == "pdf":
            return self._render_pdf(stem, data), "application/pdf", "pdf"
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"Unsupported format: {fmt}")

    def _render_xlsx(self, title: str, data: dict) -> bytes:
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.title = "Report"
        ws.append(["Report", title])
        cover = data.get("cover") or {}
        for k, v in cover.items():
            ws.append([k, str(v)])
        ws.append([])
        rows = data.get("rows") or data.get("activities") or []
        if rows and isinstance(rows[0], dict):
            headers = list(rows[0].keys())
            ws.append(headers)
            for row in rows:
                ws.append([json.dumps(row.get(h), default=str) if isinstance(row.get(h), (dict, list)) else row.get(h) for h in headers])
        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)
        return buffer.read()

    def _render_pdf(self, title: str, data: dict) -> bytes:
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=36)
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name="CoverMeta", parent=styles["Normal"], fontSize=10, spaceAfter=4))
        story: list[Any] = []
        cover = data.get("cover") or {}
        story.append(Paragraph(f"DPDPA Regulatory Report: {title.replace('_', ' ').title()}", styles["Title"]))
        story.append(Spacer(1, 8))
        for key in ("org_name", "report_date", "compliance_score", "compliance_status", "penalty_mitigated_crores", "dpdpa_applicability"):
            if key in cover:
                story.append(Paragraph(f"<b>{key.replace('_', ' ').title()}:</b> {cover[key]}", styles["CoverMeta"]))
        story.append(Spacer(1, 16))

        flat_rows = [["Section", "Value"]]
        for section_key in ("metrics", "summary", "portfolio"):
            section = data.get(section_key)
            if isinstance(section, dict):
                for k, v in section.items():
                    if not isinstance(v, (dict, list)):
                        flat_rows.append([k, str(v)[:120]])
        if len(flat_rows) > 1:
            table = Table(flat_rows, colWidths=[2.5 * inch, 4.0 * inch])
            table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
                        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                        ("FONTSIZE", (0, 0), (-1, -1), 9),
                        ("GRID", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                    ]
                )
            )
            story.append(table)

        doc.build(story)
        buffer.seek(0)
        return buffer.read()

    @staticmethod
    def to_response(content: bytes, content_type: str, filename: str, report_key: str, fmt: str):
        from app.schemas.regulatory_report import RegulatoryReportResponse

        return RegulatoryReportResponse(
            report_key=report_key,
            format=fmt,
            filename=filename,
            content_type=content_type,
            data_base64=base64.b64encode(content).decode(),
        )
