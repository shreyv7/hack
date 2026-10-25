import { useCallback, useEffect, useState } from 'react';
import { fetchSetupStatus } from '@/lib/api/workspace';
import type { SetupStatus } from '@/types/workspace';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';

export function useSetupStatus() {
  const org = useComplianceOrg();
  const [data, setData] = useState<SetupStatus | null>(null);
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
      const result = await fetchSetupStatus(org.orgIdParam);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load setup status');
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
