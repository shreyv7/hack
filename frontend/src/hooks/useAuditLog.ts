import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { AuditEvent, AuditLogSummary, AuditVerifyResult, PaginatedAuditEvents } from '@/types/compliance';

export function useAuditLog() {
  const org = useComplianceOrg();
  const [events, setEvents] = useState<PaginatedAuditEvents | null>(null);
  const [summary, setSummary] = useState<AuditLogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    q: '',
    event_type: '',
    actor: '',
    page: 1,
    page_size: 10,
  });

  const load = useCallback(async () => {
    if (!org.hasOrg) {
      setEvents(null);
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ev, sum] = await Promise.all([
        complianceApi.fetchAuditEvents({
          orgId: org.orgIdParam,
          q: filters.q || undefined,
          event_type: filters.event_type || undefined,
          actor: filters.actor || undefined,
          page: filters.page,
          page_size: filters.page_size,
        }),
        complianceApi.fetchAuditSummary(org.orgIdParam),
      ]);
      setEvents(ev);
      setSummary(sum);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam, filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const verify = useCallback(async (): Promise<AuditVerifyResult> => {
    const result = await complianceApi.verifyAuditLog(org.orgIdParam);
    await load();
    return result;
  }, [org.orgIdParam, load]);

  const getEvent = useCallback(
    (eventId: string): Promise<AuditEvent> =>
      complianceApi.fetchAuditEvent(eventId, org.orgIdParam),
    [org.orgIdParam]
  );

  return {
    ...org,
    events,
    summary,
    loading,
    error,
    filters,
    setFilters,
    reload: load,
    verify,
    getEvent,
  };
}
