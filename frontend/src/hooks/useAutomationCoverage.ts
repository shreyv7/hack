import { useCallback, useEffect, useState } from 'react';
import { fetchAutomationCoverage } from '@/lib/api/dashboard';
import type { AutomationCoverage } from '@/types/dashboard';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';

export function useAutomationCoverage() {
  const org = useComplianceOrg();
  const [data, setData] = useState<AutomationCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!org.hasOrg) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAutomationCoverage(org.orgIdParam);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load automation coverage');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    ...org,
    data,
    loading,
    error,
    reload,
  };
}
