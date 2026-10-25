import type { ReactElement } from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchComplianceScoreTrend } from '@/lib/api/dashboard';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { ComplianceScoreTrendPoint } from '@/types/dashboard';

interface ComplianceTrendProps {
  loading?: boolean;
  /** Live score from dashboard summary — keeps the latest chart point aligned with the gauge. */
  liveScore?: number | null;
}

export function ComplianceTrend({ loading: parentLoading, liveScore }: ComplianceTrendProps): ReactElement {
  const [points, setPoints] = useState<ComplianceScoreTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [trendError, setTrendError] = useState<string | null>(null);
  const { orgIdParam, hasOrg } = useComplianceOrg();
  const gradientId = `compliance-trend-${useId()}`;
  const navigate = useNavigate();

  useEffect(() => {
    if (!hasOrg) {
      setPoints([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetchComplianceScoreTrend(orgIdParam, 30)
      .then((trend) => {
        setPoints(trend.points);
        setTrendError(null);
      })
      .catch((e: unknown) => {
        setPoints([]);
        setTrendError(e instanceof Error ? e.message : 'Failed to load trend');
      })
      .finally(() => setLoading(false));
  }, [hasOrg, orgIdParam]);

  const chartData = useMemo(() => {
    const mapped = points.map((p, i) => ({
      id: i,
      date: p.date,
      score: p.score,
      annotation: p.annotation,
    }));
    if (liveScore == null || Number.isNaN(liveScore)) {
      return mapped;
    }
    if (mapped.length === 0) {
      return [
        {
          id: 0,
          date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          score: liveScore,
          annotation: null as string | null,
        },
      ];
    }
    const next = [...mapped];
    next[next.length - 1] = { ...next[next.length - 1], score: liveScore };
    return next;
  }, [points, liveScore]);
  const annotated = points.find((p) => p.annotation);

  return (
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] h-full">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          className="text-lg font-semibold text-[var(--text-primary)] hover:underline"
          onClick={() => navigate('/compliance/score')}
        >
          Compliance Trend (30 days)
        </button>
        <span className="text-[10px] text-[var(--text-tertiary)] hidden sm:inline">
          Live score synced to today
        </span>
      </div>

      {loading || parentLoading ? (
        <p className="text-sm text-[var(--text-secondary)] py-16 text-center">Loading trend…</p>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-16 text-center">
          {trendError ?? 'No trend data yet. Scores will appear as controls and evidence are documented over time.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--border-default)' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: 'var(--text-tertiary)', fontSize: 12 }}
              axisLine={{ stroke: 'var(--border-default)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--surface-card)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="var(--brand-primary)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
            />
            {annotated ? (
              <ReferenceDot
                x={annotated.date}
                y={annotated.score}
                r={6}
                fill="var(--status-danger)"
                stroke="white"
                strokeWidth={2}
              />
            ) : null}
          </AreaChart>
        </ResponsiveContainer>
      )}

      {annotated ? (
        <div className="mt-4 flex items-start gap-2 px-4">
          <div className="size-2 rounded-full mt-1.5 bg-[var(--status-danger)]" />
          <div>
            <div className="text-xs font-medium text-[var(--text-primary)]">{annotated.annotation}</div>
            <div className="text-xs text-[var(--text-tertiary)]">{annotated.date}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
