export interface DashboardMetricCard {
  key: string;
  label: string;
  value: string;
  trend: string | null;
  trend_direction: string | null;
  route_path: string;
}

export interface DashboardSidebarKpi {
  key: string;
  label: string;
  value: string;
  route_path: string | null;
}

export interface DashboardSummary {
  organization_id: string;
  organization_name: string;
  compliance_score: number;
  compliance_status: string;
  penalty_mitigated_crores: number;
  penalty_worst_crores: number;
  score_delta_week: number | null;
  last_calculated_at: string | null;
  metric_cards: DashboardMetricCard[];
  sidebar_kpis: DashboardSidebarKpi[];
}

export interface ModuleHealthItem {
  module: string;
  label: string;
  score: number;
  status: string;
  gap_count: number;
  route_path: string;
}

export interface ActivityFeedItem {
  id: string;
  time: string;
  actor: string;
  action: string;
  module: string;
  deep_link: string;
}

export interface DeadlineItem {
  id: string;
  title: string;
  due_at: string;
  category: string;
  severity: string;
  route_path: string;
}

export interface ProcessingTrendPoint {
  month: string;
  consents: number;
  dsar_requests: number;
  integration_events: number;
}

export interface RiskHeatmapCell {
  category: string;
  level: string;
  score: number;
  route_path: string;
}

export interface OnboardingAlertItem {
  key: string;
  message: string;
  severity: string;
  route_path: string;
}

export interface OnboardingStatus {
  complete: boolean;
  alerts: OnboardingAlertItem[];
}

export interface ComplianceScore {
  overall_score: number;
  status_label: string;
  penalty_mitigated_crores: number;
  penalty_worst_crores: number;
  last_calculated_at: string | null;
  score_delta_week: number | null;
  days_since_incident: number | null;
}

export interface ComplianceScoreControlGap {
  label: string;
  severity: string;
}

export interface ComplianceScoreControlItem {
  name: string;
  complete: boolean;
  configure_route: string;
}

export interface ComplianceScoreSection {
  section_key: string;
  title: string;
  statute_reference: string;
  score: number;
  status: string;
  controls_completed: number;
  controls_total: number;
  penalty_crores: number | null;
  configure_route: string;
  gaps: ComplianceScoreControlGap[];
  controls: ComplianceScoreControlItem[];
  statute_excerpt?: string | null;
}

export interface ComplianceScoreBreakdown {
  sections: ComplianceScoreSection[];
}

export interface ComplianceScoreTrendPoint {
  date: string;
  score: number;
  annotation: string | null;
}

export interface ComplianceScoreTrend {
  points: ComplianceScoreTrendPoint[];
}

export interface AutomationCoverageSectionRow {
  section_key: string;
  chapter: number;
  chapter_title: string;
  section_number: string;
  title: string;
  automation_status: string;
  feature_count: number;
  route_path: string | null;
}

export interface AutomationCoverageChapterSummary {
  chapter: number;
  title: string;
  fully_automated: number;
  partial: number;
  manual: number;
  total: number;
}

export interface AutomationCoverage {
  coverage_percent: number;
  fully_automated: number;
  partial: number;
  manual: number;
  not_applicable: number;
  total_sections: number;
  chapters: AutomationCoverageChapterSummary[];
  sections: AutomationCoverageSectionRow[];
  rationale_counts: Record<string, number>;
}

export interface DashboardData {
  summary: DashboardSummary;
  moduleHealth: ModuleHealthItem[];
  activityFeed: ActivityFeedItem[];
  deadlines: DeadlineItem[];
  processingTrend: ProcessingTrendPoint[];
  onboarding: OnboardingStatus;
  riskHeatmap: RiskHeatmapCell[];
  complianceBreakdown: ComplianceScoreBreakdown | null;
  complianceScore: ComplianceScore | null;
}
