import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ComplianceScoreBreakdown, ComplianceScoreSection, ModuleHealthItem } from '@/types/dashboard';
import type { TimelineStatus } from '@/types';

interface ModuleHealthProps {
  items: ModuleHealthItem[];
  breakdown?: ComplianceScoreBreakdown | null;
  loading?: boolean;
}

function mapStatus(status: string): TimelineStatus {
  if (status === 'healthy' || status === 'good_standing' || status.includes('success')) return 'success';
  if (status === 'critical' || status === 'danger' || status.includes('risk')) return 'danger';
  return 'warning';
}

const BAR_COLOR: Record<TimelineStatus, string> = {
  success: 'bg-[var(--status-success)]',
  warning: 'bg-[var(--status-warning)]',
  danger: 'bg-[var(--status-danger)]',
};

const STATUS_RING: Record<TimelineStatus, string> = {
  success: 'border-[var(--status-success)]',
  warning: 'border-[var(--status-warning)]',
  danger: 'border-[var(--status-danger)]',
};

function sectionsForModule(module: string, sections: ComplianceScoreSection[]): ComplianceScoreSection[] {
  switch (module) {
    case 'consent':
      return sections.filter(
        (section) =>
          section.section_key.startsWith('2-') &&
          !['2-8', '2-9', '2-10'].includes(section.section_key),
      );
    case 'safeguards':
      return sections.filter(
        (section) =>
          ['2-8', '2-9', '2-10'].includes(section.section_key) ||
          section.title.toLowerCase().includes('security'),
      );
    case 'dsar':
      return sections.filter((section) => section.section_key.startsWith('3-'));
    case 'pii':
      return sections.filter(
        (section) =>
          section.title.toLowerCase().includes('pii') || section.section_key.startsWith('4-'),
      );
    case 'compliance':
      return sections;
    default:
      return [];
  }
}

function gapSeverityClass(severity: string): string {
  if (severity === 'critical' || severity === 'high') {
    return 'text-[var(--status-danger)]';
  }
  if (severity === 'medium' || severity === 'warning') {
    return 'text-[var(--status-warning)]';
  }
  return 'text-[var(--text-secondary)]';
}

export function ModuleHealth({ items, breakdown, loading }: ModuleHealthProps): ReactElement {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ModuleHealthItem | null>(null);

  const selectedSections = useMemo(() => {
    if (!selected || !breakdown) return [];
    return sectionsForModule(selected.module, breakdown.sections);
  }, [breakdown, selected]);

  const selectedGaps = useMemo(
    () => selectedSections.flatMap((section) => section.gaps),
    [selectedSections],
  );

  const selectedControls = useMemo(
    () => selectedSections.flatMap((section) => section.controls),
    [selectedSections],
  );

  const totalGaps = items.reduce((sum, item) => sum + item.gap_count, 0);
  const avgScore = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    : 0;

  if (loading) {
    return (
      <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <p className="text-sm text-[var(--text-secondary)]">Loading module health…</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <h2 className="text-lg font-semibold mb-1 text-[var(--text-primary)]">Module Health</h2>
        <p className="text-sm text-[var(--text-secondary)]">
          No module data yet. Configure consent notices and DPDPA map controls to see posture scores.
        </p>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Module Health</h2>
          <p className="text-xs text-[var(--text-secondary)]">DPDPA modules mapped to live posture</p>
        </div>
        <div className="flex gap-4 text-xs text-[var(--text-secondary)]">
          <span>
            Avg score: <strong className="text-[var(--text-primary)]">{avgScore}</strong>
          </span>
          <span>
            Total gaps: <strong className="text-[var(--text-primary)]">{totalGaps}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((module) => {
          const status = mapStatus(module.status);
          return (
            <button
              key={module.module}
              type="button"
              onClick={() => setSelected(module)}
              className={cn(
                'p-3 rounded-lg border text-left transition-all hover:shadow-sm hover:-translate-y-0.5',
                'bg-[var(--surface-raised)] border-[var(--border-default)]',
                STATUS_RING[status],
                'border-l-2',
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl font-semibold text-[var(--text-primary)]">{module.score}</span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {module.gap_count} gap{module.gap_count === 1 ? '' : 's'}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full mb-2 bg-[var(--surface-card)]">
                <div
                  className={cn('h-full rounded-full transition-all', BAR_COLOR[status])}
                  style={{ width: `${module.score}%` }}
                />
              </div>
              <h3 className="text-xs font-semibold text-[var(--text-primary)] leading-tight">{module.label}</h3>
            </button>
          );
        })}
      </div>

      {selected ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-y-auto">
            <div className="border-b border-[var(--border-default)] px-6 py-4 flex items-center justify-between sticky top-0 bg-[var(--surface-card)]">
              <div>
                <h2 className="font-semibold text-[var(--text-primary)]">{selected.label}</h2>
                <p className="text-sm text-[var(--text-secondary)] mt-1">
                  Score {selected.score} · {selected.gap_count} gaps
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                aria-label="Close module details"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              {selectedGaps.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Open gaps</h3>
                  <ul className="space-y-2">
                    {selectedGaps.map((gap) => (
                      <li
                        key={gap.label}
                        className="flex items-start gap-2 text-sm text-[var(--text-secondary)]"
                      >
                        <span className={cn('font-medium shrink-0', gapSeverityClass(gap.severity))}>
                          {gap.severity}
                        </span>
                        <span>{gap.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">
                  No open gaps recorded for this module.
                </p>
              )}

              {selectedControls.length > 0 ? (
                <div>
                  <h3 className="text-sm font-semibold mb-3 text-[var(--text-primary)]">Controls</h3>
                  <ul className="space-y-2">
                    {selectedControls.slice(0, 8).map((control) => (
                      <li
                        key={control.name}
                        className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"
                      >
                        {control.complete ? (
                          <Check className="size-4 text-[var(--status-success)] shrink-0" />
                        ) : (
                          <X className="size-4 text-[var(--status-warning)] shrink-0" />
                        )}
                        <span className={control.complete ? 'line-through opacity-70' : undefined}>
                          {control.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  {selectedControls.length > 8 ? (
                    <p className="text-xs text-[var(--text-tertiary)] mt-2">
                      +{selectedControls.length - 8} more controls in module
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    navigate(selected.route_path);
                    setSelected(null);
                  }}
                  className="flex-1 px-4 py-2 bg-[var(--brand-primary)] text-white rounded-md hover:opacity-90 transition-opacity"
                >
                  Open module
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-4 py-2 border border-[var(--border-default)] rounded-md hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
