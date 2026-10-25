import { apiFetch } from '@/lib/api/client';
import type {
  AiDashboardResponse,
  DashboardTemplate,
  ExportFormat,
  ExportResponse,
  GovernanceAiAssistResponse,
  GovernanceDashboard,
  GovernanceDashboardDetail,
  GovernanceWidget,
  PaginatedDashboards,
  PublicDashboardView,
  ScheduleRecord,
  ShareRecord,
  WidgetCatalogItem,
  WidgetDataSource,
  WidgetMetrics,
  WidgetType,
} from '@/types/governanceDashboard';

function withOrg(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

const BASE = '/governance/dashboards';

export function fetchGovernanceDashboards(
  orgId?: string,
  params?: { page?: number; search?: string; pinned_only?: boolean }
): Promise<PaginatedDashboards> {
  const q = new URLSearchParams();
  if (params?.page) q.set('page', String(params.page));
  if (params?.search) q.set('search', params.search);
  if (params?.pinned_only) q.set('pinned_only', 'true');
  const qs = q.toString();
  return apiFetch(withOrg(`${BASE}${qs ? `?${qs}` : ''}`, orgId));
}

export function fetchGovernanceDashboard(id: string, orgId?: string): Promise<GovernanceDashboardDetail> {
  return apiFetch(withOrg(`${BASE}/${id}`, orgId));
}

export function createGovernanceDashboard(
  body: {
    name: string;
    description?: string;
    template_key?: string;
    is_pinned?: boolean;
    widgets?: unknown[];
  },
  orgId?: string
): Promise<GovernanceDashboardDetail> {
  return apiFetch(withOrg(BASE, orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function updateGovernanceDashboard(
  id: string,
  body: Record<string, unknown>,
  orgId?: string
): Promise<GovernanceDashboardDetail> {
  return apiFetch(withOrg(`${BASE}/${id}`, orgId), { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteGovernanceDashboard(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`${BASE}/${id}`, orgId), { method: 'DELETE' });
}

export function cloneGovernanceDashboard(id: string, orgId?: string): Promise<GovernanceDashboardDetail> {
  return apiFetch(withOrg(`${BASE}/${id}/clone`, orgId), { method: 'POST' });
}

export function toggleDashboardFavourite(id: string, orgId?: string): Promise<GovernanceDashboard> {
  return apiFetch(withOrg(`${BASE}/${id}/favourite`, orgId), { method: 'POST' });
}

export function updateDashboardLayout(
  id: string,
  body: { layout_json: Record<string, unknown>; widgets: Array<{ id: string; layout_json: Record<string, unknown>; sort_order?: number }> },
  orgId?: string
): Promise<GovernanceDashboardDetail> {
  return apiFetch(withOrg(`${BASE}/${id}/layout`, orgId), { method: 'PUT', body: JSON.stringify(body) });
}

export function fetchWidgetMetrics(
  body: {
    data_source: WidgetDataSource;
    widget_type?: WidgetType;
    time_range?: string;
    business_unit_id?: string | null;
    property_id?: string | null;
    purpose_id?: string | null;
    channel?: string | null;
    journey_key?: string | null;
    limit?: number;
  },
  orgId?: string
): Promise<WidgetMetrics> {
  return apiFetch(withOrg(`${BASE}/metrics/query`, orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function fetchDashboardTemplates(search?: string): Promise<DashboardTemplate[]> {
  const qs = search ? `?search=${encodeURIComponent(search)}` : '';
  return apiFetch(`${BASE}/catalog/templates${qs}`);
}

export function fetchWidgetCatalog(category?: string): Promise<WidgetCatalogItem[]> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : '';
  return apiFetch(`${BASE}/catalog/widgets${qs}`);
}

export function exportGovernanceDashboard(
  id: string,
  format: ExportFormat,
  orgId?: string
): Promise<ExportResponse> {
  return apiFetch(withOrg(`${BASE}/${id}/export`, orgId), {
    method: 'POST',
    body: JSON.stringify({ format, include_widgets: true }),
  });
}

export function fetchDashboardShares(id: string, orgId?: string): Promise<ShareRecord[]> {
  return apiFetch(withOrg(`${BASE}/${id}/shares`, orgId));
}

export function addDashboardShare(
  id: string,
  body: { shared_with_user_id?: string; shared_with_role?: string; permission?: string },
  orgId?: string
): Promise<ShareRecord> {
  return apiFetch(withOrg(`${BASE}/${id}/shares`, orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function removeDashboardShare(id: string, shareId: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`${BASE}/${id}/shares/${shareId}`, orgId), { method: 'DELETE' });
}

export function revokePublicLink(id: string, shareId: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`${BASE}/${id}/public-link/${shareId}`, orgId), { method: 'DELETE' });
}

export interface PublicLinkCreateBody {
  permission?: 'read' | 'editor' | 'owner';
  expires_at?: string | null;
  password?: string | null;
}

export function createPublicLink(
  id: string,
  orgId?: string,
  body: PublicLinkCreateBody = { permission: 'read' }
): Promise<{ public_token: string; public_url: string; expires_at: string | null }> {
  const payload: Record<string, unknown> = { permission: body.permission ?? 'read' };
  if (body.expires_at) payload.expires_at = body.expires_at;
  if (body.password) payload.password = body.password;
  return apiFetch(withOrg(`${BASE}/${id}/public-link`, orgId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDashboardSchedules(id: string, orgId?: string): Promise<ScheduleRecord[]> {
  return apiFetch(withOrg(`${BASE}/${id}/schedules`, orgId));
}

export function createDashboardSchedule(
  id: string,
  body: {
    name: string;
    frequency: string;
    delivery_channel: string;
    export_format?: string;
    delivery_config_json?: Record<string, unknown>;
  },
  orgId?: string
): Promise<ScheduleRecord> {
  return apiFetch(withOrg(`${BASE}/${id}/schedules`, orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function deleteDashboardSchedule(id: string, scheduleId: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`${BASE}/${id}/schedules/${scheduleId}`, orgId), { method: 'DELETE' });
}

export function fetchPublicDashboard(token: string, password?: string): Promise<PublicDashboardView> {
  const qs = password ? `?password=${encodeURIComponent(password)}` : '';
  return apiFetch(`${BASE}/public/${encodeURIComponent(token)}${qs}`, { auth: false, skipAuthRedirect: true });
}

export function addDashboardWidget(
  dashboardId: string,
  body: { widget_type: WidgetType; data_source: WidgetDataSource; title: string; layout_json?: Record<string, unknown> },
  orgId?: string
): Promise<GovernanceWidget> {
  return apiFetch(withOrg(`${BASE}/${dashboardId}/widgets`, orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function deleteDashboardWidget(dashboardId: string, widgetId: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`${BASE}/${dashboardId}/widgets/${widgetId}`, orgId), { method: 'DELETE' });
}

export function analyzeDashboardAi(
  action: string,
  query?: string,
  orgId?: string
): Promise<AiDashboardResponse> {
  return apiFetch(withOrg(`${BASE}/ai/analyze`, orgId), {
    method: 'POST',
    body: JSON.stringify({ action, query }),
  });
}

export function fetchGovernanceAiAssist(
  action: 'welcome' | 'quick_ask',
  dashboardId?: string,
  question?: string,
  orgId?: string
): Promise<GovernanceAiAssistResponse> {
  return apiFetch(withOrg(`${BASE}/ai/assist`, orgId), {
    method: 'POST',
    body: JSON.stringify({ action, dashboard_id: dashboardId ?? null, question: question ?? null }),
  });
}

export function downloadExportFile(response: ExportResponse): void {
  if (!response.data_base64) return;
  const bytes = Uint8Array.from(atob(response.data_base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: response.content_type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = response.filename;
  a.click();
  URL.revokeObjectURL(url);
}
