import { useCallback, useEffect } from 'react';
import * as complianceApi from '@/lib/api/compliance';
import { useComplianceLoader, useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { SecuritySafeguardsData } from '@/types/compliance';

export function useSecuritySafeguards() {
  const org = useComplianceOrg();
  const safeguards = useComplianceLoader<SecuritySafeguardsData>(
    complianceApi.fetchSecuritySafeguards,
    org.orgIdParam,
    org.hasOrg
  );

  const updateControl = useCallback(
    async (
      controlId: string,
      body: { status?: string; items_completed?: number; evidence_label?: string | null }
    ) => {
      await complianceApi.updateSecurityControl(controlId, body, org.orgIdParam);
      await safeguards.refreshSilent();
    },
    [org.orgIdParam, safeguards]
  );

  useEffect(() => {
    if (!org.hasOrg) return;
    const intervalId = window.setInterval(() => {
      void safeguards.refreshSilent();
    }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [org.hasOrg, safeguards.refreshSilent]);

  return { ...org, safeguards, updateControl };
}
