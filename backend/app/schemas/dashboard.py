from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DashboardMetricCard(BaseModel):
    key: str
    label: str
    value: str
    trend: str | None = None
    trend_direction: str | None = None
    route_path: str


class DashboardSidebarKpi(BaseModel):
    key: str
    label: str
    value: str
    route_path: str | None = None


class DashboardSummaryRead(BaseModel):
    organization_id: UUID
    organization_name: str
    compliance_score: int
    compliance_status: str
    penalty_mitigated_crores: int
    penalty_worst_crores: int
    score_delta_week: int | None = None
    last_calculated_at: datetime | None = None
    metric_cards: list[DashboardMetricCard]
    sidebar_kpis: list[DashboardSidebarKpi]


class ModuleHealthItem(BaseModel):
    module: str
    label: str
    score: int
    status: str
    gap_count: int
    route_path: str


class ActivityFeedItem(BaseModel):
    id: str
    time: datetime
    actor: str
    action: str
    module: str
    deep_link: str


class DeadlineItem(BaseModel):
    id: str
    title: str
    due_at: datetime
    category: str
    severity: str
    route_path: str


class ProcessingTrendPoint(BaseModel):
    month: str
    consents: int
    dsar_requests: int
    integration_events: int


class RiskHeatmapCell(BaseModel):
    category: str
    level: str
    score: int
    route_path: str


class OnboardingAlertItem(BaseModel):
    key: str
    message: str
    severity: str
    route_path: str


class OnboardingStatusRead(BaseModel):
    complete: bool
    alerts: list[OnboardingAlertItem] = Field(default_factory=list)


class ComplianceScoreRead(BaseModel):
    overall_score: int
    status_label: str
    penalty_mitigated_crores: int
    penalty_worst_crores: int
    last_calculated_at: datetime | None = None
    score_delta_week: int | None = None
    days_since_incident: int | None = None


class ComplianceScoreControlGap(BaseModel):
    label: str
    severity: str


class ComplianceScoreControlItem(BaseModel):
    name: str
    complete: bool
    configure_route: str


class ComplianceScoreSectionRead(BaseModel):
    section_key: str
    title: str
    statute_reference: str
    score: int
    status: str
    controls_completed: int
    controls_total: int
    penalty_crores: int | None = None
    configure_route: str
    gaps: list[ComplianceScoreControlGap] = Field(default_factory=list)
    controls: list[ComplianceScoreControlItem] = Field(default_factory=list)
    statute_excerpt: str | None = None


class ComplianceScoreBreakdownRead(BaseModel):
    sections: list[ComplianceScoreSectionRead]


class ComplianceScoreTrendPoint(BaseModel):
    date: str
    score: int
    annotation: str | None = None


class ComplianceScoreTrendRead(BaseModel):
    points: list[ComplianceScoreTrendPoint]


class AutomationCoverageSectionRow(BaseModel):
    section_key: str
    chapter: int
    chapter_title: str
    section_number: str
    title: str
    automation_status: str
    feature_count: int
    route_path: str | None = None


class AutomationCoverageChapterSummary(BaseModel):
    chapter: int
    title: str
    fully_automated: int
    partial: int
    manual: int
    total: int


class AutomationCoverageRead(BaseModel):
    coverage_percent: int
    fully_automated: int
    partial: int
    manual: int
    not_applicable: int
    total_sections: int
    chapters: list[AutomationCoverageChapterSummary]
    sections: list[AutomationCoverageSectionRow]
    rationale_counts: dict[str, int] = Field(default_factory=dict)
