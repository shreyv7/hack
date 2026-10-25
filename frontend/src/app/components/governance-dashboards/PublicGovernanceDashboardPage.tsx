import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { Shield } from 'lucide-react';
import { WidgetRenderer } from '@/app/components/governance-dashboards/WidgetRenderer';
import { fetchPublicDashboard } from '@/lib/api/governanceDashboard';
import { ApiError } from '@/lib/api/client';
import type { PublicDashboardView, WidgetMetrics } from '@/types/governanceDashboard';

export function PublicGovernanceDashboardPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState('');

  const load = useCallback(async (pwd?: string) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const view = await fetchPublicDashboard(token, pwd);
      setData(view);
      setNeedsPassword(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setNeedsPassword(true);
        setError('This dashboard link is password protected.');
      } else {
        setError(e instanceof Error ? e.message : 'Unable to load dashboard');
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const metricsByWidgetId = useMemo(() => {
    if (!data) return {} as Record<string, WidgetMetrics>;
    const map: Record<string, WidgetMetrics> = {};
    data.widgets.forEach((widget, idx) => {
      const metrics = data.widget_metrics[idx];
      if (metrics) map[widget.id] = metrics;
    });
    return map;
  }, [data]);

  if (loading && !needsPassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] text-[var(--text-secondary)]">
        Loading dashboard…
      </div>
    );
  }

  if (needsPassword && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] p-4">
        <div className="max-w-md w-full bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="size-5 text-[var(--brand-primary)]" />
            <h1 className="font-semibold text-lg">Protected Dashboard</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-4">{error ?? 'Enter the password to view this dashboard.'}</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-3 py-2 mb-4 border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)]"
          />
          <button
            type="button"
            onClick={() => void load(password)}
            className="w-full py-2 bg-[var(--brand-primary)] text-white rounded-md font-medium"
          >
            View Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] text-[var(--status-danger)] p-4">
        {error ?? 'Dashboard not found'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)]">
      <header className="border-b border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-4">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] mb-1">
            <Shield className="size-3.5" /> Vajra — Shared Dashboard
          </div>
          <h1 className="text-xl font-semibold">{data.dashboard_name}</h1>
          {data.dashboard_description && (
            <p className="text-sm text-[var(--text-secondary)] mt-1">{data.dashboard_description}</p>
          )}
        </div>
      </header>
      <main className="max-w-[1400px] mx-auto p-6">
        <div className="grid grid-cols-12 gap-4">
          {data.widgets.map((widget) => (
            <WidgetRenderer key={widget.id} widget={widget} metrics={metricsByWidgetId[widget.id]} />
          ))}
        </div>
        {data.widgets.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)] text-center py-12">This dashboard has no widgets.</p>
        )}
      </main>
    </div>
  );
}
