import type { ReactElement } from 'react';

/**
 * Compact "Showing X–Y of N · Prev/Next" pager for tables. Renders nothing when
 * there's a single page. Page is 0-indexed.
 */
export function TablePager({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}): ReactElement | null {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--border-default)] text-xs text-[var(--text-secondary)]">
      <span>
        Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1 rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40"
        >
          Prev
        </button>
        <span>
          Page {page + 1} of {pageCount}
        </span>
        <button
          onClick={() => onPage(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          className="px-3 py-1 rounded border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
