import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { cn } from '@/lib/utils';
import type { DeadlineItem } from '@/types/dashboard';

const PAGE_SIZE = 10;

interface UpcomingDeadlinesProps {
  items: DeadlineItem[];
  loading?: boolean;
}

type DeadlineSeverity = 'critical' | 'warning' | 'info';

const SEVERITY_ICON: Record<DeadlineSeverity, LucideIcon> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLOR: Record<DeadlineSeverity, string> = {
  critical: 'text-[var(--status-danger)]',
  warning: 'text-[var(--status-warning)]',
  info: 'text-[var(--status-info)]',
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function subtitleFor(item: DeadlineItem): string {
  const due = new Date(item.due_at);
  const hours = Math.round((due.getTime() - Date.now()) / 3600000);
  if (hours < 0) return `${item.category} · OVERDUE`;
  if (hours <= 24) return `${item.category} · ${hours}h remaining`;
  const days = Math.ceil(hours / 24);
  return `${item.category} · due in ${days} day${days === 1 ? '' : 's'}`;
}

export function UpcomingDeadlines({ items, loading }: UpcomingDeadlinesProps): ReactElement {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<DeadlineItem | null>(null);
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const paginatedItems = useMemo(
    () => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [items, page],
  );

  useEffect(() => {
    setPage(0);
  }, [items]);

  useEffect(() => {
    if (page >= pageCount) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  return (
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] h-full flex flex-col">
      <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)] shrink-0">Upcoming Deadlines</h2>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading deadlines…</p>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--text-secondary)] text-center px-2">
            No upcoming deadlines. DSAR SLAs and breach notification windows will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {paginatedItems.map((deadline) => {
            const severity = (deadline.severity as DeadlineSeverity) || 'info';
            const Icon = SEVERITY_ICON[severity] ?? Info;
            return (
              <div
                key={deadline.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(deadline)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') setSelected(deadline);
                }}
                className="flex items-start gap-2 p-3 rounded-lg border border-[var(--border-default)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              >
                <Icon className={cn('size-5 shrink-0 mt-0.5', SEVERITY_COLOR[severity])} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium mb-1 text-[var(--text-primary)]">{deadline.title}</h3>
                  <p className={cn('text-xs', SEVERITY_COLOR[severity])}>{subtitleFor(deadline)}</p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(deadline.route_path);
                  }}
                  className="text-xs font-medium hover:underline shrink-0 text-[var(--brand-primary)]"
                >
                  Open
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && items.length > PAGE_SIZE ? (
        <div className="mt-4 -mx-6 -mb-6">
          <TablePager
            page={page}
            pageCount={pageCount}
            total={items.length}
            pageSize={PAGE_SIZE}
            onPage={setPage}
          />
        </div>
      ) : null}

      {selected ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">{selected.title}</h2>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Close deadline details"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Due {formatDue(selected.due_at)} · {selected.category}
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    navigate(selected.route_path);
                    setSelected(null);
                  }}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  Start Task
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-900 dark:text-gray-100"
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
