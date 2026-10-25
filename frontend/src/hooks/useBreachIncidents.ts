import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import { fetchDsarDashboard } from '@/lib/api/dsar';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { BreachIncident, SecuritySafeguardsSummary } from '@/types/compliance';
import type { DataRightsRequest } from '@/types/dsar';

export function useBreachIncidents() {
  const org = useComplianceOrg();
  const [incidents, setIncidents] = useState<BreachIncident[]>([]);
  const [dsarSlaBreaches, setDsarSlaBreaches] = useState<DataRightsRequest[]>([]);
  const [safeguardsSummary, setSafeguardsSummary] = useState<SecuritySafeguardsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org.hasOrg) {
      setIncidents([]);
      setDsarSlaBreaches([]);
      setSafeguardsSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [breaches, summary, dsarDashboard] = await Promise.all([
        complianceApi.listBreachIncidents(org.orgIdParam),
        complianceApi.fetchSecuritySafeguardsSummary(org.orgIdParam).catch(() => null),
        fetchDsarDashboard(org.orgIdParam).catch(() => null),
      ]);
      setIncidents(breaches);
      setDsarSlaBreaches(dsarDashboard?.breached_requests ?? []);
      setSafeguardsSummary(summary);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load breach incidents');
      setIncidents([]);
      setDsarSlaBreaches([]);
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam]);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...org,
    incidents,
    dsarSlaBreaches,
    safeguardsSummary,
    loading,
    error,
    reload: load,
  };
}
