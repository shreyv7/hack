import type { ReactElement } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProcessingTrendPoint } from '@/types/dashboard';

interface DataProcessingChartProps {
  points: ProcessingTrendPoint[];
  loading?: boolean;
}

export function DataProcessingChart({ points, loading }: DataProcessingChartProps): ReactElement {
  const chartData = points.map((p) => ({
    month: p.month,
    consents: p.consents,
    dsarRequests: p.dsar_requests,
    integrationEvents: p.integration_events,
  }));

  const totalConsents = points.reduce((sum, p) => sum + p.consents, 0);
  const totalDsar = points.reduce((sum, p) => sum + p.dsar_requests, 0);
  const totalIntegration = points.reduce((sum, p) => sum + p.integration_events, 0);

  return (
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Data Processing Activity</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Monthly consents, DSARs, and integration events
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)] py-16 text-center">Loading chart…</p>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-16 text-center">No processing activity yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" vertical={false} />
            <XAxis dataKey="month" stroke="var(--text-tertiary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
            <YAxis stroke="var(--text-tertiary)" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
              }}
              cursor={{ fill: 'rgba(0, 0, 0, 0.05)' }}
            />
            <Legend
              wrapperStyle={{
                paddingTop: '20px',
                fontSize: '12px',
                color: 'var(--text-secondary)',
              }}
            />
            <Bar dataKey="consents" name="Consent Receipts" fill="var(--status-success)" radius={[4, 4, 0, 0]} />
            <Bar dataKey="dsarRequests" name="DSAR Requests" fill="var(--status-info)" radius={[4, 4, 0, 0]} />
            <Bar
              dataKey="integrationEvents"
              name="Integration Events"
              fill="var(--status-danger)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="px-3 py-2 rounded-lg bg-[var(--status-success-bg)]">
          <div className="text-[10px] mb-0.5 text-[var(--text-secondary)]">Consents (period)</div>
          <div className="text-xl font-semibold text-[var(--status-success)]">{totalConsents.toLocaleString()}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--status-info-bg)]">
          <div className="text-[10px] mb-0.5 text-[var(--text-secondary)]">DSAR (period)</div>
          <div className="text-xl font-semibold text-[var(--status-info)]">{totalDsar.toLocaleString()}</div>
        </div>
        <div className="px-3 py-2 rounded-lg bg-[var(--status-danger-bg)]">
          <div className="text-[10px] mb-0.5 text-[var(--text-secondary)]">Integration events</div>
          <div className="text-xl font-semibold text-[var(--status-danger)]">{totalIntegration.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
}
