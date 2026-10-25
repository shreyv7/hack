import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowRight,
  FileText,
  Map,
  ScanSearch,
  Shield,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  ComplianceScoreBreakdown,
  DashboardSidebarKpi,
} from '@/types/dashboard';

interface DashboardSidebarProps {
  kpis: DashboardSidebarKpi[];
  breakdown?: ComplianceScoreBreakdown | null;
  loading?: boolean;
}

const QUICK_ACTIONS = [
  { label: 'Publish consent notice', path: '/consent/notices', icon: FileText },
  { label: 'Run PII scan', path: '/scanner/pii', icon: ScanSearch },
  { label: 'Review open DSARs', path: '/rights/tracker', icon: Users },
  { label: 'Open DPDPA map', path: '/compliance/map', icon: Map },
  { label: 'CISO command center', path: '/security/ciso', icon: Shield },
] as const;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  warning: 3,
  low: 4,
};

function gapSeverityClass(severity: string): string {
  if (severity === 'critical' || severity === 'high') return 'text-[var(--status-danger)]';
  if (severity === 'medium' || severity === 'warning') return 'text-[var(--status-warning)]';
  return 'text-[var(--text-secondary)]';
}

export function DashboardSidebar({ kpis, breakdown, loading }: DashboardSidebarProps): ReactElement {
  const navigate = useNavigate();

  const topGaps = useMemo(() => {
    if (!breakdown) return [];
    return breakdown.sections
      .flatMap((section) =>
        section.gaps.map((gap) => ({
          ...gap,
          sectionTitle: section.title,
          route: section.configure_route,
        })),
      )
      .sort(
        (a, b) =>
          (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99),
      )
      .slice(0, 5);
  }, [breakdown]);

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Operational KPIs</h2>
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {kpis.map((kpi) => (
              <button
                key={kpi.key}
                type="button"
                onClick={() => kpi.route_path && navigate(kpi.route_path)}
                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left"
              >
                <span className="text-xs text-[var(--text-secondary)]">{kpi.label}</span>
                <span className="text-lg font-semibold text-[var(--text-primary)]">{kpi.value}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] flex-1">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Priority gaps</h2>
          <button
            type="button"
            onClick={() => navigate('/compliance/score')}
            className="text-xs font-medium hover:underline text-[var(--brand-primary)]"
          >
            View all
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
        ) : topGaps.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            No open gaps — your DPDPA map controls are fully documented.
          </p>
        ) : (
          <ul className="space-y-2">
            {topGaps.map((gap) => (
              <li key={`${gap.sectionTitle}-${gap.label}`}>
                <button
                  type="button"
                  onClick={() => navigate(gap.route)}
                  className="w-full text-left p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span className={cn('text-[10px] font-semibold uppercase shrink-0 mt-0.5', gapSeverityClass(gap.severity))}>
                      {gap.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">{gap.label}</p>
                      <p className="text-[10px] text-[var(--text-tertiary)] truncate">{gap.sectionTitle}</p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <h2 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Quick actions</h2>
        <div className="space-y-1">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.path}
                type="button"
                onClick={() => navigate(action.path)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm text-[var(--text-secondary)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--text-primary)] transition-colors"
              >
                <Icon className="size-4 shrink-0 text-[var(--brand-primary)]" />
                <span className="flex-1">{action.label}</span>
                <ArrowRight className="size-3 shrink-0 opacity-50" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
