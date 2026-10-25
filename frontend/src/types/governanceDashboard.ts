export type DashboardVisibility = 'private' | 'workspace' | 'organization';
export type DashboardPermission = 'read' | 'editor' | 'owner';
export type WidgetType =
  | 'kpi_card' | 'line_chart' | 'bar_chart' | 'pie_chart' | 'donut_chart' | 'heatmap'
  | 'table' | 'list' | 'compliance_card' | 'deadlines' | 'risk_matrix' | 'incident_timeline'
  | 'scorecard' | 'progress_bar' | 'map' | 'markdown' | 'ai_summary';
export type WidgetDataSource =
  | 'consent' | 'proof_vault' | 'rights' | 'dpia' | 'ropa' | 'policy' | 'vendor_risk'
  | 'security' | 'breach' | 'audit' | 'monitoring' | 'compliance_score' | 'module_health'
  | 'retention' | 'data_sources';
export type ExportFormat = 'pdf' | 'xlsx' | 'csv' | 'pptx' | 'png' | 'json';
export type ScheduleFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'custom';
export type DeliveryChannel = 'email' | 'slack' | 'teams' | 'webhook';

export interface DashboardFilters {
  time_range: string;
  business_unit_id?: string | null;
  business_unit?: string | null; // legacy
  framework?: string | null; // deprecated
  workspace_id?: string | null;
  auto_refresh_seconds?: number | null;
  property_id?: string | null;
  purpose_id?: string | null;
  channel?: string | null;
  journey_key?: string | null;
}

export interface WidgetLayout {
  col: number;
  row: number;
  col_span: number;
  row_span: number;
}

export interface GovernanceWidget {
  id: string;
  dashboard_id: string;
  widget_type: WidgetType;
  data_source: WidgetDataSource;
  title: string;
  config_json: Record<string, unknown>;
  layout_json: WidgetLayout;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GovernanceDashboard {
  id: string;
  organization_id: string;
  owner_user_id: string | null;
  owner_name: string | null;
  name: string;
  description: string | null;
  slug: string;
  visibility: DashboardVisibility;
  is_template: boolean;
  template_key: string | null;
  is_pinned: boolean;
  is_favourite: boolean;
  layout_json: Record<string, unknown>;
  filters_json: DashboardFilters;
  auto_refresh_seconds: number | null;
  version: number;
  last_refreshed_at: string | null;
  widget_count: number;
  created_at: string;
  updated_at: string;
}

export interface GovernanceDashboardDetail extends GovernanceDashboard {
  widgets: GovernanceWidget[];
}

export interface PaginatedDashboards {
  items: GovernanceDashboard[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DashboardTemplate {
  key: string;
  name: string;
  description: string;
  audience: string;
  widget_count: number;
}

export interface WidgetCatalogItem {
  widget_type: WidgetType;
  label: string;
  category: string;
  supported_data_sources: WidgetDataSource[];
  default_col_span: number;
}

export interface WidgetMetrics {
  data_source: WidgetDataSource;
  widget_type?: WidgetType;
  data: Record<string, unknown>;
  fetched_at: string;
  route_paths: Record<string, string>;
}

export interface ShareRecord {
  id: string;
  dashboard_id: string;
  shared_with_user_id: string | null;
  shared_with_user_name: string | null;
  shared_with_role: string | null;
  permission: DashboardPermission;
  public_token: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface ScheduleRecord {
  id: string;
  dashboard_id: string;
  name: string;
  frequency: ScheduleFrequency;
  cron_expression: string | null;
  delivery_channel: DeliveryChannel;
  delivery_config_json: Record<string, unknown>;
  export_format: ExportFormat;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface AiDashboardResponse {
  action: string;
  summary: string;
  details: string[];
  score_prediction?: number | null;
  matched_dashboards?: string[];
}

export interface GovernanceAiAssistResponse {
  configured: boolean;
  summary: string;
  bullets: string[];
  model_id?: string | null;
  used_fallback: boolean;
  copilot_context: string;
}

export interface ExportResponse {
  format: ExportFormat;
  filename: string;
  content_type: string;
  data_base64?: string | null;
}

export interface PublicDashboardView {
  dashboard_name: string;
  dashboard_description: string | null;
  filters_json: DashboardFilters;
  widgets: GovernanceWidget[];
  widget_metrics: WidgetMetrics[];
  requires_password: boolean;
  expires_at: string | null;
}
