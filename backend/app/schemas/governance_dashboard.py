"""Pydantic schemas for governance compliance dashboards."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.governance_dashboard import (
    DashboardPermission,
    DashboardVisibility,
    DeliveryChannel,
    ExportFormat,
    ScheduleFrequency,
    WidgetDataSource,
    WidgetType,
)


class DashboardFilters(BaseModel):
    time_range: str = "90d"
    business_unit_id: UUID | None = None
    business_unit: str | None = None  # deprecated legacy string name
    framework: str | None = None  # deprecated — platform is DPDPA-only
    workspace_id: str | None = None
    auto_refresh_seconds: int | None = None
    property_id: UUID | None = None
    purpose_id: UUID | None = None
    channel: str | None = None
    journey_key: str | None = None


class WidgetLayout(BaseModel):
    col: int = Field(ge=1, le=12, default=1)
    row: int = Field(ge=1, default=1)
    col_span: int = Field(ge=1, le=12, default=4)
    row_span: int = Field(ge=1, default=1)


class WidgetConfig(BaseModel):
    filters: dict[str, Any] = Field(default_factory=dict)
    date_range: str | None = None
    framework: str | None = None
    department: str | None = None
    workspace_id: str | None = None
    chart_options: dict[str, Any] = Field(default_factory=dict)
    markdown_content: str | None = None


class WidgetCreate(BaseModel):
    widget_type: WidgetType
    data_source: WidgetDataSource
    title: str = Field(min_length=1, max_length=255)
    config_json: WidgetConfig | dict[str, Any] = Field(default_factory=dict)
    layout_json: WidgetLayout | dict[str, Any] = Field(default_factory=WidgetLayout)
    sort_order: int = 0


class WidgetUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    config_json: dict[str, Any] | None = None
    layout_json: dict[str, Any] | None = None
    sort_order: int | None = None


class WidgetRead(BaseModel):
    id: UUID
    dashboard_id: UUID
    widget_type: WidgetType
    data_source: WidgetDataSource
    title: str
    config_json: dict[str, Any]
    layout_json: dict[str, Any]
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    visibility: DashboardVisibility = DashboardVisibility.private
    template_key: str | None = None
    is_pinned: bool = False
    filters_json: DashboardFilters | dict[str, Any] = Field(default_factory=DashboardFilters)
    auto_refresh_seconds: int | None = None
    widgets: list[WidgetCreate] = Field(default_factory=list)


class DashboardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    visibility: DashboardVisibility | None = None
    is_pinned: bool | None = None
    filters_json: dict[str, Any] | None = None
    auto_refresh_seconds: int | None = None
    layout_json: dict[str, Any] | None = None


class DashboardRead(BaseModel):
    id: UUID
    organization_id: UUID
    owner_user_id: UUID | None
    owner_name: str | None = None
    name: str
    description: str | None
    slug: str
    visibility: DashboardVisibility
    is_template: bool
    template_key: str | None
    is_pinned: bool
    is_favourite: bool = False
    layout_json: dict[str, Any]
    filters_json: dict[str, Any]
    auto_refresh_seconds: int | None
    version: int
    last_refreshed_at: datetime | None
    widget_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardDetailRead(DashboardRead):
    widgets: list[WidgetRead] = Field(default_factory=list)


class DashboardLayoutUpdate(BaseModel):
    layout_json: dict[str, Any]
    widgets: list[dict[str, Any]] = Field(default_factory=list)


class PaginatedDashboards(BaseModel):
    items: list[DashboardRead]
    total: int
    page: int
    page_size: int
    pages: int


class ShareCreate(BaseModel):
    shared_with_user_id: UUID | None = None
    shared_with_role: str | None = None
    permission: DashboardPermission = DashboardPermission.read
    expires_at: datetime | None = None
    password: str | None = None


class ShareRead(BaseModel):
    id: UUID
    dashboard_id: UUID
    shared_with_user_id: UUID | None
    shared_with_user_name: str | None = None
    shared_with_role: str | None
    permission: DashboardPermission
    public_token: str | None
    expires_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicLinkCreate(BaseModel):
    permission: DashboardPermission = DashboardPermission.read
    expires_at: datetime | None = None
    password: str | None = None


class PublicLinkRead(BaseModel):
    public_token: str
    public_url: str
    expires_at: datetime | None


class ScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    frequency: ScheduleFrequency
    cron_expression: str | None = None
    delivery_channel: DeliveryChannel
    delivery_config_json: dict[str, Any] = Field(default_factory=dict)
    export_format: ExportFormat = ExportFormat.pdf
    is_active: bool = True


class ScheduleUpdate(BaseModel):
    name: str | None = None
    frequency: ScheduleFrequency | None = None
    cron_expression: str | None = None
    delivery_channel: DeliveryChannel | None = None
    delivery_config_json: dict[str, Any] | None = None
    export_format: ExportFormat | None = None
    is_active: bool | None = None


class ScheduleRead(BaseModel):
    id: UUID
    dashboard_id: UUID
    name: str
    frequency: ScheduleFrequency
    cron_expression: str | None
    delivery_channel: DeliveryChannel
    delivery_config_json: dict[str, Any]
    export_format: ExportFormat
    is_active: bool
    last_run_at: datetime | None
    next_run_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DashboardVersionRead(BaseModel):
    id: UUID
    dashboard_id: UUID
    version_number: int
    created_by_user_id: UUID | None
    created_by_name: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AuditRead(BaseModel):
    id: UUID
    dashboard_id: UUID | None
    organization_id: UUID
    user_id: UUID | None
    user_name: str | None = None
    action: str
    details_json: dict[str, Any] | None
    created_at: datetime

    model_config = {"from_attributes": True}


class PaginatedAudit(BaseModel):
    items: list[AuditRead]
    total: int
    page: int
    page_size: int
    pages: int


class TemplateRead(BaseModel):
    key: str
    name: str
    description: str
    audience: str
    widget_count: int
    widgets: list[WidgetCreate] = Field(default_factory=list)


class WidgetTypeCatalogItem(BaseModel):
    widget_type: WidgetType
    label: str
    category: str
    supported_data_sources: list[WidgetDataSource]
    default_col_span: int = 4


class MetricsQuery(BaseModel):
    data_source: WidgetDataSource
    widget_type: WidgetType | None = None
    time_range: str = "90d"
    business_unit_id: UUID | None = None
    business_unit: str | None = None  # deprecated legacy
    framework: str | None = None  # deprecated — ignored
    property_id: UUID | None = None
    purpose_id: UUID | None = None
    channel: str | None = None
    journey_key: str | None = None
    limit: int = Field(default=20, ge=1, le=100)


class WidgetMetricsResponse(BaseModel):
    data_source: WidgetDataSource
    widget_type: WidgetType | None = None
    data: dict[str, Any]
    fetched_at: datetime
    route_paths: dict[str, str] = Field(default_factory=dict)


class PublicDashboardRead(BaseModel):
    dashboard_name: str
    dashboard_description: str | None
    filters_json: dict[str, Any]
    widgets: list[WidgetRead] = Field(default_factory=list)
    widget_metrics: list[WidgetMetricsResponse] = Field(default_factory=list)
    requires_password: bool = False
    expires_at: datetime | None = None


class ExportRequest(BaseModel):
    format: ExportFormat
    include_widgets: bool = True
    delivery_email: str | None = None


class ExportResponse(BaseModel):
    format: ExportFormat
    filename: str
    content_type: str
    data_base64: str | None = None
    download_url: str | None = None


class AiDashboardRequest(BaseModel):
    action: Literal[
        "explain",
        "executive_summary",
        "compliance_gaps",
        "recommendations",
        "predict_score",
        "risk_trend",
        "search",
    ]
    query: str | None = None


class AiDashboardResponse(BaseModel):
    action: str
    summary: str
    details: list[str] = Field(default_factory=list)
    score_prediction: int | None = None
    matched_dashboards: list[str] = Field(default_factory=list)


# --- Governance AI Assist (Bedrock-powered) ---

class GovernanceAiAssistRequest(BaseModel):
    action: Literal["welcome", "quick_ask"] = "welcome"
    dashboard_id: UUID | None = None
    question: str | None = None


class GovernanceAiAssistResponse(BaseModel):
    configured: bool
    summary: str
    bullets: list[str] = Field(default_factory=list)
    model_id: str | None = None
    used_fallback: bool = False
    copilot_context: str
