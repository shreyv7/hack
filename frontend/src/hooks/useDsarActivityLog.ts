import { useCallback, useEffect, useMemo, useState } from 'react';
import { TABLE_PAGE_SIZE } from '@/app/hooks/useClientPagination';
import { ApiError } from '@/lib/api/client';
import * as dsarApi from '@/lib/api/dsar';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { DataRightType, DsarActivityAction, DsarActivityLog } from '@/types/dsar';

const SEARCH_DEBOUNCE_MS = 350;

export function useDsarActivityLog() {
  const org = useComplianceOrg();
  const [log, setLog] = useState<DsarActivityLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    tracking_id: '',
    action: '' as DsarActivityAction | '',
    right_type: '' as DataRightType | '',
    actor: '',
    page: 1,
  });
  const [debouncedSearch, setDebouncedSearch] = useState({
    tracking_id: '',
    actor: '',
  });

  const pageSize = TABLE_PAGE_SIZE;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch({
        tracking_id: filters.tracking_id.trim(),
        actor: filters.actor.trim(),
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [filters.tracking_id, filters.actor]);

  const hasActiveFilters = useMemo(
    () =>
      Boolean(
        debouncedSearch.tracking_id ||
          debouncedSearch.actor ||
          filters.action ||
          filters.right_type
      ),
    [debouncedSearch, filters.action, filters.right_type]
  );

  const load = useCallback(async () => {
    if (!org.hasOrg) {
      setLog(null);
      setLoading(false);
      setHasLoaded(false);
      return;
    }
    if (!org.canEdit) {
      setLog(null);
      setLoading(false);
      setHasLoaded(false);
      setError('Admin access required');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await dsarApi.fetchDsarActivityLog(org.orgIdParam, {
        tracking_id: debouncedSearch.tracking_id || undefined,
        action: filters.action || undefined,
        right_type: filters.right_type || undefined,
        actor: debouncedSearch.actor || undefined,
        limit: pageSize,
        offset: (filters.page - 1) * pageSize,
      });
      setLog(data);
      setHasLoaded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load activity log');
      setLog(null);
      setHasLoaded(false);
    } finally {
      setLoading(false);
    }
  }, [
    org.hasOrg,
    org.canEdit,
    org.orgIdParam,
    debouncedSearch.tracking_id,
    debouncedSearch.actor,
    filters.action,
    filters.right_type,
    filters.page,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...org,
    log,
    loading: loading || org.loading,
    hasLoaded,
    hasActiveFilters,
    error: error ?? org.error,
    filters,
    setFilters,
    reload: load,
    pageSize,
  };
}
