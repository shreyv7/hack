"""Built-in dashboard templates and widget catalog."""

from app.models.governance_dashboard import WidgetDataSource, WidgetType
from app.schemas.governance_dashboard import TemplateRead, WidgetCreate, WidgetTypeCatalogItem


WIDGET_CATALOG: list[WidgetTypeCatalogItem] = [
    WidgetTypeCatalogItem(widget_type=WidgetType.kpi_card, label="KPI Card", category="Metrics & KPIs", supported_data_sources=[WidgetDataSource.compliance_score, WidgetDataSource.consent, WidgetDataSource.rights, WidgetDataSource.breach, WidgetDataSource.retention, WidgetDataSource.data_sources], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.line_chart, label="Line Chart", category="Charts", supported_data_sources=[WidgetDataSource.consent, WidgetDataSource.compliance_score, WidgetDataSource.monitoring], default_col_span=6),
    WidgetTypeCatalogItem(widget_type=WidgetType.bar_chart, label="Bar Chart", category="Charts", supported_data_sources=[WidgetDataSource.breach, WidgetDataSource.ropa, WidgetDataSource.audit], default_col_span=6),
    WidgetTypeCatalogItem(widget_type=WidgetType.pie_chart, label="Pie Chart", category="Charts", supported_data_sources=[WidgetDataSource.rights, WidgetDataSource.consent], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.donut_chart, label="Donut Chart", category="Charts", supported_data_sources=[WidgetDataSource.rights, WidgetDataSource.dpia], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.heatmap, label="Heatmap", category="Charts", supported_data_sources=[WidgetDataSource.security, WidgetDataSource.compliance_score], default_col_span=8),
    WidgetTypeCatalogItem(widget_type=WidgetType.table, label="Table", category="Tables & Lists", supported_data_sources=[WidgetDataSource.breach, WidgetDataSource.audit, WidgetDataSource.vendor_risk], default_col_span=8),
    WidgetTypeCatalogItem(widget_type=WidgetType.list, label="List", category="Tables & Lists", supported_data_sources=[WidgetDataSource.audit, WidgetDataSource.policy], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.compliance_card, label="Compliance Card", category="Compliance-specific", supported_data_sources=[WidgetDataSource.compliance_score], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.deadlines, label="Deadlines", category="Compliance-specific", supported_data_sources=[WidgetDataSource.rights, WidgetDataSource.dpia, WidgetDataSource.policy], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.risk_matrix, label="Risk Matrix", category="Compliance-specific", supported_data_sources=[WidgetDataSource.security, WidgetDataSource.vendor_risk], default_col_span=6),
    WidgetTypeCatalogItem(widget_type=WidgetType.incident_timeline, label="Incident Timeline", category="Compliance-specific", supported_data_sources=[WidgetDataSource.breach], default_col_span=8),
    WidgetTypeCatalogItem(widget_type=WidgetType.scorecard, label="Scorecard", category="Metrics & KPIs", supported_data_sources=[WidgetDataSource.module_health], default_col_span=12),
    WidgetTypeCatalogItem(widget_type=WidgetType.progress_bar, label="Progress Bar", category="Metrics & KPIs", supported_data_sources=[WidgetDataSource.ropa, WidgetDataSource.policy, WidgetDataSource.retention], default_col_span=4),
    WidgetTypeCatalogItem(widget_type=WidgetType.ai_summary, label="AI Summary", category="Compliance-specific", supported_data_sources=[WidgetDataSource.compliance_score], default_col_span=12),
    WidgetTypeCatalogItem(widget_type=WidgetType.markdown, label="Markdown", category="Compliance-specific", supported_data_sources=[WidgetDataSource.compliance_score], default_col_span=6),
]


def _executive_widgets() -> list[WidgetCreate]:
    return [
        WidgetCreate(widget_type=WidgetType.compliance_card, data_source=WidgetDataSource.compliance_score, title="Compliance Score", layout_json={"col": 1, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.compliance_score, title="Penalty Exposure", layout_json={"col": 5, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.breach, title="Active Incidents", layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.donut_chart, data_source=WidgetDataSource.rights, title="DSAR SLA Performance", layout_json={"col": 1, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.line_chart, data_source=WidgetDataSource.consent, title="Consent Rate Over Time", layout_json={"col": 5, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.consent, title="A/B Testing Results", layout_json={"col": 9, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.scorecard, data_source=WidgetDataSource.module_health, title="Module Health by DPDPA Section", layout_json={"col": 1, "row": 3, "col_span": 12, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.bar_chart, data_source=WidgetDataSource.breach, title="Breach Incident Trend", layout_json={"col": 1, "row": 4, "col_span": 12, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.table, data_source=WidgetDataSource.breach, title="Recent Breach Incidents", layout_json={"col": 1, "row": 5, "col_span": 8, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.deadlines, data_source=WidgetDataSource.rights, title="Upcoming Deadlines", layout_json={"col": 9, "row": 5, "col_span": 4, "row_span": 1}),
    ]


def _fino_dpo_widgets() -> list[WidgetCreate]:
    return [
        WidgetCreate(
            widget_type=WidgetType.compliance_card,
            data_source=WidgetDataSource.compliance_score,
            title="Compliance Score",
            layout_json={"col": 1, "row": 1, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.ropa,
            title="RoPA — Missing Channel",
            layout_json={"col": 5, "row": 1, "col_span": 4, "row_span": 1},
            config_json={"metric_key": "without_channel"},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.ropa,
            title="RoPA — Missing Data Source",
            layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1},
            config_json={"metric_key": "without_data_source"},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.ropa,
            title="RoPA — Missing Retention Link",
            layout_json={"col": 1, "row": 2, "col_span": 4, "row_span": 1},
            config_json={"metric_key": "without_retention_link"},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.ropa,
            title="RoPA — Without DPIA",
            layout_json={"col": 5, "row": 2, "col_span": 4, "row_span": 1},
            config_json={"metric_key": "without_dpia"},
        ),
        WidgetCreate(
            widget_type=WidgetType.bar_chart,
            data_source=WidgetDataSource.ropa,
            title="RoPA Activities by Channel",
            layout_json={"col": 1, "row": 3, "col_span": 12, "row_span": 1},
            config_json={"metric_key": "by_channel"},
        ),
        WidgetCreate(
            widget_type=WidgetType.donut_chart,
            data_source=WidgetDataSource.rights,
            title="DSAR SLA Performance",
            layout_json={"col": 9, "row": 2, "col_span": 4, "row_span": 1},
        ),
    ]


def _fino_regulatory_widgets() -> list[WidgetCreate]:
    return [
        WidgetCreate(
            widget_type=WidgetType.compliance_card,
            data_source=WidgetDataSource.compliance_score,
            title="DPDPA Compliance Score",
            layout_json={"col": 1, "row": 1, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.consent,
            title="Consent Rate",
            layout_json={"col": 5, "row": 1, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.donut_chart,
            data_source=WidgetDataSource.rights,
            title="DSAR SLA Performance",
            layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.progress_bar,
            data_source=WidgetDataSource.retention,
            title="Retention Actions (§8(7))",
            layout_json={"col": 1, "row": 2, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.data_sources,
            title="Data Source Coverage",
            layout_json={"col": 5, "row": 2, "col_span": 4, "row_span": 1},
        ),
        WidgetCreate(
            widget_type=WidgetType.kpi_card,
            data_source=WidgetDataSource.ropa,
            title="RoPA — Missing Retention Link",
            layout_json={"col": 9, "row": 2, "col_span": 4, "row_span": 1},
            config_json={"metric_key": "without_retention_link"},
        ),
        WidgetCreate(
            widget_type=WidgetType.scorecard,
            data_source=WidgetDataSource.module_health,
            title="DPDPA Module Health",
            layout_json={"col": 1, "row": 3, "col_span": 12, "row_span": 1},
        ),
    ]


def _fino_legal_widgets() -> list[WidgetCreate]:
    return [
        WidgetCreate(widget_type=WidgetType.compliance_card, data_source=WidgetDataSource.compliance_score, title="Compliance Score", layout_json={"col": 1, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.donut_chart, data_source=WidgetDataSource.rights, title="DSAR SLA", layout_json={"col": 5, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.consent, title="Consent Status", layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.ropa, title="RoPA High-Risk Activities", layout_json={"col": 1, "row": 2, "col_span": 4, "row_span": 1}, config_json={"metric_key": "high_risk_activities"}),
        WidgetCreate(widget_type=WidgetType.progress_bar, data_source=WidgetDataSource.retention, title="Retention Obligations", layout_json={"col": 5, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.scorecard, data_source=WidgetDataSource.module_health, title="Regulatory Gap Scorecard", layout_json={"col": 1, "row": 3, "col_span": 12, "row_span": 1}),
    ]


def _fino_ciso_widgets() -> list[WidgetCreate]:
    return [
        WidgetCreate(widget_type=WidgetType.heatmap, data_source=WidgetDataSource.security, title="Security Risk Heatmap", layout_json={"col": 1, "row": 1, "col_span": 8, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.breach, title="Active Incidents", layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.data_sources, title="Data Source Coverage", layout_json={"col": 1, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.compliance_card, data_source=WidgetDataSource.compliance_score, title="DPDPA Posture", layout_json={"col": 5, "row": 2, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.bar_chart, data_source=WidgetDataSource.breach, title="Breach Trend", layout_json={"col": 1, "row": 3, "col_span": 12, "row_span": 1}),
    ]


BUILTIN_TEMPLATES: list[TemplateRead] = [
    TemplateRead(key="executive-summary", name="Executive Summary", description="Board-ready compliance posture overview.", audience="Executive Leadership", widget_count=10, widgets=_executive_widgets()),
    TemplateRead(key="dpo-daily", name="DPO Daily Brief", description="Operational compliance snapshot for DPO teams.", audience="DPO & Compliance Team", widget_count=6, widgets=_executive_widgets()[:6]),
    TemplateRead(key="fino-dpo-banking", name="Fino DPO Banking Compliance", description="Banking RoPA cross-module KPIs for DPO review (Req 8).", audience="DPO & Compliance Team", widget_count=7, widgets=_fino_dpo_widgets()),
    TemplateRead(key="fino-regulatory-pack", name="Fino Regulatory Pack Dashboard", description="Cross-module regulatory KPIs for RBI/DPDPA filing (Req 9).", audience="DPO & Compliance Team", widget_count=7, widgets=_fino_regulatory_widgets()),
    TemplateRead(key="fino-dpo-regulatory", name="Fino DPO Regulatory Overview", description="DPO-focused consent, DSAR, retention, and RoPA metrics.", audience="DPO", widget_count=7, widgets=_fino_regulatory_widgets()),
    TemplateRead(key="fino-legal-filing", name="Fino Legal Filing Pack", description="Legal team filing dashboard with compliance gaps.", audience="Legal", widget_count=6, widgets=_fino_legal_widgets()),
    TemplateRead(key="fino-ciso-posture", name="Fino CISO Security Posture", description="Security, breach, and data-source coverage for CISO review.", audience="CISO", widget_count=5, widgets=_fino_ciso_widgets()),
    TemplateRead(key="audit-committee", name="Audit Committee", description="Audit-focused controls and evidence coverage.", audience="Audit Committee", widget_count=7, widgets=_executive_widgets()[:7]),
    TemplateRead(key="board-reporting", name="Board of Directors", description="Quarterly board reporting pack.", audience="Board of Directors", widget_count=8, widgets=_executive_widgets()[:8]),
    TemplateRead(key="security-posture", name="Security Posture", description="Security safeguards and incident monitoring.", audience="CISO & Security Team", widget_count=5, widgets=[
        WidgetCreate(widget_type=WidgetType.heatmap, data_source=WidgetDataSource.security, title="Security Risk Heatmap", layout_json={"col": 1, "row": 1, "col_span": 8, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.kpi_card, data_source=WidgetDataSource.breach, title="Active Incidents", layout_json={"col": 9, "row": 1, "col_span": 4, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.bar_chart, data_source=WidgetDataSource.breach, title="Breach Trend", layout_json={"col": 1, "row": 2, "col_span": 12, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.table, data_source=WidgetDataSource.audit, title="Security Audit Events", layout_json={"col": 1, "row": 3, "col_span": 8, "row_span": 1}),
        WidgetCreate(widget_type=WidgetType.deadlines, data_source=WidgetDataSource.policy, title="Policy Renewals", layout_json={"col": 9, "row": 3, "col_span": 4, "row_span": 1}),
    ]),
    TemplateRead(key="engineering-compliance", name="Engineering Compliance", description="Developer-focused compliance metrics.", audience="Engineering Team", widget_count=4, widgets=_executive_widgets()[4:8]),
    TemplateRead(key="customer-trust", name="Customer Trust Report", description="Consent and transparency metrics for customer trust.", audience="Customer Success", widget_count=4, widgets=_executive_widgets()[3:7]),
    TemplateRead(key="regulator-filing", name="Regulator Filing Pack", description="Regulator-ready compliance evidence summary.", audience="Legal & Compliance", widget_count=6, widgets=_executive_widgets()[:6]),
    TemplateRead(key="sdf-quarterly", name="SDF Quarterly Report", description="Significant Data Fiduciary quarterly obligations.", audience="DPO & Legal", widget_count=7, widgets=_executive_widgets()[:7]),
]


class GovernanceTemplateService:
    def list_templates(self, search: str | None = None) -> list[TemplateRead]:
        items = BUILTIN_TEMPLATES
        if search:
            needle = search.lower()
            items = [t for t in items if needle in t.name.lower() or needle in t.description.lower()]
        return items

    def get_template(self, key: str) -> TemplateRead | None:
        return next((t for t in BUILTIN_TEMPLATES if t.key == key), None)

    def list_widget_catalog(self, category: str | None = None) -> list[WidgetTypeCatalogItem]:
        if not category:
            return WIDGET_CATALOG
        return [w for w in WIDGET_CATALOG if w.category.lower() == category.lower()]
