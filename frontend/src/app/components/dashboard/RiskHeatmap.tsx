import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import type { RiskHeatmapCell } from '@/types/dashboard';

interface RiskHeatmapProps {
  cells: RiskHeatmapCell[];
  loading?: boolean;
  compact?: boolean;
}

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

const LEVEL_STYLES: Record<RiskLevel, { bg: string; text: string; label: string }> = {
  low: {
    bg: 'bg-[var(--status-success-bg)]',
    text: 'text-[var(--status-success)]',
    label: 'Low',
  },
  medium: {
    bg: 'bg-[var(--status-warning-bg)]',
    text: 'text-[var(--status-warning)]',
    label: 'Medium',
  },
  high: {
    bg: 'bg-[var(--status-danger-bg)]',
    text: 'text-[var(--status-danger)]',
    label: 'High',
  },
  critical: {
    bg: 'bg-[var(--status-danger-bg)]',
    text: 'text-[var(--status-danger)]',
    label: 'Critical',
  },
};

function normalizeLevel(level: string): RiskLevel {
  if (level === 'low' || level === 'medium' || level === 'high' || level === 'critical') {
    return level;
  }
  return 'medium';
}

export function RiskHeatmap({ cells, loading, compact }: RiskHeatmapProps): ReactElement {
  const navigate = useNavigate();

  return (
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] h-full">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Risk Heatmap</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Category-level posture by domain
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">Loading…</p>
      ) : cells.length === 0 ? (
        <p className="text-sm text-[var(--text-secondary)] py-6 text-center">
          Complete CISO controls or DPDPA map sections to populate risk categories.
        </p>
      ) : (
        <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6')}>
          {cells.map((cell) => {
            const level = normalizeLevel(cell.level);
            const styles = LEVEL_STYLES[level];
            return (
              <button
                key={cell.category}
                type="button"
                onClick={() => navigate(cell.route_path)}
                className={cn(
                  'p-3 rounded-lg border border-[var(--border-default)] text-left transition-all hover:shadow-sm',
                  styles.bg,
                )}
              >
                <div className="text-[10px] font-medium uppercase tracking-wide mb-1 text-[var(--text-secondary)] truncate">
                  {cell.category}
                </div>
                <div className={cn('text-xl font-semibold', styles.text)}>{cell.score}</div>
                <div className={cn('text-[10px] font-medium', styles.text)}>{styles.label}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
