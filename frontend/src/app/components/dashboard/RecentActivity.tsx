import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { AlertCircle, CheckCircle, FileText, Shield } from 'lucide-react';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import { cn } from '@/lib/utils';
import type { ActivityFeedItem } from '@/types/dashboard';

interface RecentActivityProps {
  items: ActivityFeedItem[];
  loading?: boolean;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function moduleIcon(module: string): { icon: LucideIcon; colorClass: string } {
  const key = module.toLowerCase();
  if (key.includes('dsar') || key.includes('rights')) {
    return { icon: FileText, colorClass: 'text-[var(--status-info)]' };
  }
  if (key.includes('breach')) {
    return { icon: AlertCircle, colorClass: 'text-[var(--status-warning)]' };
  }
  if (key.includes('audit')) {
    return { icon: Shield, colorClass: 'text-[var(--status-ai)]' };
  }
  return { icon: CheckCircle, colorClass: 'text-[var(--status-success)]' };
}

export function RecentActivity({ items, loading }: RecentActivityProps): ReactElement {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(items.length / TABLE_PAGE_SIZE));
  const paginatedItems = useMemo(
    () => items.slice(page * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE + TABLE_PAGE_SIZE),
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
    <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] flex flex-col h-full min-h-[520px]">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Recent Activity</h2>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
            {items.length > 0 ? `${items.length} events across audit log and DSAR activity` : 'Audit and rights events'}
          </p>
        </div>
        <button
          type="button"
          className="text-xs font-medium hover:underline text-[var(--brand-primary)] shrink-0"
          onClick={() => navigate('/audit/log')}
        >
          View all
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading activity…</p>
      ) : items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--text-secondary)] text-center px-4">
            No recent activity. Actions across consent, DSAR, and audit modules will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-hidden">
            <div className="divide-y divide-[var(--border-default)] border border-[var(--border-default)] rounded-lg overflow-hidden">
              {paginatedItems.map((activity) => {
                const { icon: Icon, colorClass } = moduleIcon(activity.module);
                return (
                  <div
                    key={activity.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(activity.deep_link)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') navigate(activity.deep_link);
                    }}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <Icon className={cn('size-4 shrink-0', colorClass)} />
                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {activity.action}
                      </p>
                      <span className="text-xs text-[var(--text-tertiary)] sm:text-right shrink-0">
                        {relativeTime(activity.time)}
                      </span>
                      <p className="text-xs text-[var(--text-secondary)] truncate col-span-full sm:col-span-1">
                        {activity.module} · {activity.actor}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {items.length > TABLE_PAGE_SIZE ? (
            <div className="mt-3 shrink-0 -mx-5 -mb-5">
              <TablePager
                page={page}
                pageCount={pageCount}
                total={items.length}
                pageSize={TABLE_PAGE_SIZE}
                onPage={setPage}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
