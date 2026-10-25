import { useCallback } from 'react';
import * as complianceApi from '@/lib/api/compliance';
import { useComplianceLoader, useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { ComplianceMapChapter, ComplianceMapSectionDetail, ComplianceMapSummary } from '@/types/compliance';

export function useComplianceMap() {
  const org = useComplianceOrg();
  const summary = useComplianceLoader<ComplianceMapSummary>(
    complianceApi.fetchComplianceMapSummary,
    org.orgIdParam,
    org.hasOrg
  );
  const chapters = useComplianceLoader<ComplianceMapChapter[]>(
    complianceApi.fetchComplianceMapChapters,
    org.orgIdParam,
    org.hasOrg
  );

  const loadSection = useCallback(
    (sectionKey: string) =>
      complianceApi.fetchComplianceMapSection(sectionKey, org.orgIdParam),
    [org.orgIdParam]
  );

  const markReviewed = useCallback(async () => {
    await complianceApi.updateComplianceMapReview(org.user?.full_name, org.orgIdParam);
    await summary.reload();
  }, [org.orgIdParam, org.user?.full_name, summary]);

  return { ...org, summary, chapters, loadSection, markReviewed };
}

export type { ComplianceMapSectionDetail };
