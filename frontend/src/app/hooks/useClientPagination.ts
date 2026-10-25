import { useEffect, useMemo, useState } from 'react';

/** Default page size for table pagination across the platform. */
export const TABLE_PAGE_SIZE = 10;

/**
 * Client-side pagination for lists already loaded in memory. Page is 0-indexed
 * (matches TablePager). Pass `resetKey` to auto-reset to page 0 when filters
 * change, or call `resetPage()` from a filter handler / useEffect.
 */
export function useClientPagination<T>(
  items: T[],
  pageSize = TABLE_PAGE_SIZE,
  resetKey?: string | number,
) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  useEffect(() => {
    if (page > pageCount - 1) {
      setPage(Math.max(0, pageCount - 1));
    }
  }, [page, pageCount]);

  const slice = useMemo(
    () => items.slice(safePage * pageSize, (safePage + 1) * pageSize),
    [items, safePage, pageSize],
  );

  return {
    page: safePage,
    setPage,
    pageCount,
    total: items.length,
    pageSize,
    slice,
    pageItems: slice,
    resetPage: () => setPage(0),
  };
}
