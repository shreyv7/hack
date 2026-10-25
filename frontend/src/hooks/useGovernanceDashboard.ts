import { useCallback, useEffect, useRef, useState } from 'react';
import {
  analyzeDashboardAi,
  createDashboardSchedule,
  createGovernanceDashboard,
  createPublicLink,
  type PublicLinkCreateBody,
  exportGovernanceDashboard,
  fetchDashboardTemplates,
  fetchGovernanceDashboard,
  fetchGovernanceDashboards,
  fetchWidgetCatalog,
  fetchWidgetMetrics,
  updateDashboardLayout,
  updateGovernanceDashboard,
  downloadExportFile,
} from '@/lib/api/governanceDashboard';
import type {
  DashboardFilters,
  DashboardTemplate,
  ExportFormat,
  GovernanceDashboard,
  GovernanceDashboardDetail,
  WidgetCatalogItem,
  WidgetMetrics,
} from '@/types/governanceDashboard';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';

function normalizeFilters(raw: Record<string, unknown> | null | undefined): DashboardFilters {
  const f = (raw ?? {}) as Partial<DashboardFilters>;
  return {
    time_range: f.time_range ?? '90d',
    business_unit_id: f.business_unit_id ?? null,
    auto_refresh_seconds: f.auto_refresh_seconds ?? null,
    workspace_id: f.workspace_id ?? null,
    property_id: f.property_id ?? null,
    purpose_id: f.purpose_id ?? null,
    channel: f.channel ?? null,
    journey_key: f.journey_key ?? null,
  };
}

export function useGovernanceDashboard() {
  const org = useComplianceOrg();
  const [dashboards, setDashboards] = useState<GovernanceDashboard[]>([]);
  const [activeDashboard, setActiveDashboard] = useState<GovernanceDashboardDetail | null>(null);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [widgetCatalog, setWidgetCatalog] = useState<WidgetCatalogItem[]>([]);
  const [widgetMetrics, setWidgetMetrics] = useState<Record<string, WidgetMetrics>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>({ time_range: '90d', business_unit_id: null });
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialDashboardLoaded = useRef(false);

  const loadWidgetMetrics = useCallback(
    async (detail: GovernanceDashboardDetail, dashFilters: DashboardFilters) => {
      if (!org.hasOrg) return;
      setRefreshing(true);
      try {
        const metricsEntries = await Promise.allSettled(
          detail.widgets.map(async (w) => {
            const m = await fetchWidgetMetrics(
              {
                data_source: w.data_source,
                widget_type: w.widget_type,
                time_range: dashFilters.time_range,
                business_unit_id: dashFilters.business_unit_id ?? null,
                property_id: dashFilters.property_id ?? null,
                purpose_id: dashFilters.purpose_id ?? null,
                channel: dashFilters.channel ?? null,
                journey_key: dashFilters.journey_key ?? null,
              },
              org.orgIdParam
            );
            return [w.id, m] as const;
          })
        );
        const next: Record<string, WidgetMetrics> = {};
        for (const entry of metricsEntries) {
          if (entry.status === 'fulfilled') {
            const [wid, m] = entry.value;
            next[wid] = m;
          }
        }
        setWidgetMetrics(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load widget metrics');
      } finally {
        setRefreshing(false);
      }
    },
    [org.hasOrg, org.orgIdParam]
  );

  const loadDashboard = useCallback(
    async (id: string) => {
      if (!org.hasOrg) return;
      setRefreshing(true);
      setError(null);
      try {
        const detail = await fetchGovernanceDashboard(id, org.orgIdParam);
        const dashFilters = normalizeFilters(detail.filters_json as unknown as Record<string, unknown>);
        setActiveDashboard(detail);
        setFilters(dashFilters);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      } finally {
        setRefreshing(false);
      }
    },
    [org.hasOrg, org.orgIdParam, loadWidgetMetrics]
  );

  const loadList = useCallback(async () => {
    if (!org.hasOrg) {
      setDashboards([]);
      setLoading(false);
      initialDashboardLoaded.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [listRes, tplRes, catRes] = await Promise.all([
        fetchGovernanceDashboards(org.orgIdParam),
        fetchDashboardTemplates(),
        fetchWidgetCatalog(),
      ]);
      setDashboards(listRes.items);
      setTemplates(tplRes);
      setWidgetCatalog(catRes);
      if (listRes.items.length > 0 && !initialDashboardLoaded.current) {
        initialDashboardLoaded.current = true;
        const pinned = listRes.items.find((d) => d.is_pinned) ?? listRes.items[0];
        await loadDashboard(pinned.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboards');
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam, loadDashboard]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (activeDashboard && !loading) {
      void loadWidgetMetrics(activeDashboard, filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload metrics when filters change
  }, [filters.time_range, filters.business_unit_id]);

  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    const seconds = activeDashboard?.auto_refresh_seconds ?? filters.auto_refresh_seconds;
    if (seconds && activeDashboard) {
      refreshTimer.current = setInterval(() => {
        void loadWidgetMetrics(activeDashboard, filters);
      }, seconds * 1000);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [
    activeDashboard,
    activeDashboard?.auto_refresh_seconds,
    filters,
    filters.auto_refresh_seconds,
    loadWidgetMetrics,
  ]);

  const selectDashboard = useCallback(
    (id: string) => {
      void loadDashboard(id);
    },
    [loadDashboard]
  );

  const createDashboard = useCallback(
    async (name: string, templateKey?: string) => {
      if (!org.hasOrg) return;
      const detail = await createGovernanceDashboard(
        { name, template_key: templateKey, is_pinned: false },
        org.orgIdParam
      );
      setActiveDashboard(detail);
      await loadList();
      return detail;
    },
    [org.hasOrg, org.orgIdParam, loadList]
  );

  const saveFilters = useCallback(
    async (next: DashboardFilters) => {
      setFilters(next);
      if (!activeDashboard || !org.hasOrg) return;
      const updated = await updateGovernanceDashboard(
        activeDashboard.id,
        { filters_json: next, auto_refresh_seconds: next.auto_refresh_seconds ?? null },
        org.orgIdParam
      );
      setActiveDashboard((prev) => (prev ? { ...prev, ...updated } : prev));
    },
    [activeDashboard, org.hasOrg, org.orgIdParam]
  );

  const saveLayout = useCallback(
    async (widgets: GovernanceDashboardDetail['widgets']) => {
      if (!activeDashboard || !org.hasOrg) return;
      const detail = await updateDashboardLayout(
        activeDashboard.id,
        {
          layout_json: activeDashboard.layout_json,
          widgets: widgets.map((w, i) => ({
            id: w.id,
            layout_json: w.layout_json as unknown as Record<string, unknown>,
            sort_order: i,
          })),
        },
        org.orgIdParam
      );
      setActiveDashboard(detail);
      setEditMode(false);
    },
    [activeDashboard, org.hasOrg, org.orgIdParam]
  );

  const exportDashboard = useCallback(
    async (format: ExportFormat) => {
      if (!activeDashboard || !org.hasOrg) return;
      const res = await exportGovernanceDashboard(activeDashboard.id, format, org.orgIdParam);
      downloadExportFile(res);
    },
    [activeDashboard, org.hasOrg, org.orgIdParam]
  );

  const scheduleReport = useCallback(
    async (body: {
      name: string;
      frequency: string;
      delivery_channel?: string;
      export_format?: string;
      delivery_config_json?: Record<string, unknown>;
    }) => {
      if (!activeDashboard || !org.hasOrg) return;
      await createDashboardSchedule(
        activeDashboard.id,
        {
          name: body.name,
          frequency: body.frequency,
          delivery_channel: body.delivery_channel ?? 'email',
          export_format: body.export_format ?? 'pdf',
          delivery_config_json: body.delivery_config_json,
        },
        org.orgIdParam
      );
    },
    [activeDashboard, org.hasOrg, org.orgIdParam]
  );

  const generatePublicLink = useCallback(
    async (body?: PublicLinkCreateBody) => {
      if (!activeDashboard || !org.hasOrg) return null;
      return createPublicLink(activeDashboard.id, org.orgIdParam, body);
    },
    [activeDashboard, org.hasOrg, org.orgIdParam]
  );

  const runAi = useCallback(
    async (action: string, query?: string) => {
      if (!org.hasOrg) return null;
      return analyzeDashboardAi(action, query, org.orgIdParam);
    },
    [org.hasOrg, org.orgIdParam]
  );

  return {
    ...org,
    dashboards,
    activeDashboard,
    templates,
    widgetCatalog,
    widgetMetrics,
    loading,
    refreshing,
    error,
    editMode,
    setEditMode,
    filters,
    setFilters,
    saveFilters,
    reload: loadList,
    selectDashboard,
    createDashboard,
    saveLayout,
    exportDashboard,
    scheduleReport,
    generatePublicLink,
    runAi,
  };
}
