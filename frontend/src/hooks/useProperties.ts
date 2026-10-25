import { useCallback, useEffect, useState } from 'react';
import { integrationsApi } from '@/lib/api/integrations';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/contexts/AuthContext';
import { getOrgIdParamForRole } from '@/lib/compliance/orgContext';
import type { Property } from '@/types/integrations';

export function useProperties() {
  const { user } = useAuth();
  const orgId = getOrgIdParamForRole(user?.role);
  const isSuperadmin = user?.role === 'superadmin';
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProperties = useCallback(async () => {
    if (isSuperadmin && !orgId) {
      setProperties([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await integrationsApi.listProperties(orgId);
      setProperties(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Failed to load properties');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isSuperadmin, orgId]);

  useEffect(() => {
    void loadProperties();
  }, [loadProperties]);

  return { properties, isLoading, error, refresh: loadProperties, orgId };
}
