import { useCallback, useEffect, useState } from 'react';
import {
  fetchActivityFeed,
  fetchComplianceScore,
  fetchComplianceScoreBreakdown,
  fetchDashboardSummary,
  fetchDeadlines,
  fetchModuleHealth,
  fetchOnboardingStatus,
  fetchProcessingTrend,
  fetchRiskHeatmap,
  recalculateComplianceScore,
} from '@/lib/api/dashboard';
import type {
  ComplianceScoreBreakdown,
  DashboardData,
  DashboardSummary,
  ModuleHealthItem,
} from '@/types/dashboard';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';

function augmentModuleHealth(
  items: ModuleHealthItem[],
  summary: DashboardSummary,
  breakdown: ComplianceScoreBreakdown | null,
): ModuleHealthItem[] {
  if (items.some((item) => item.module === 'compliance')) {
    return items;
  }
  const score = summary.compliance_score;
  const gapCount = breakdown?.sections.reduce((sum, section) => sum + section.gaps.length, 0) ?? 0;
  return [
    ...items,
    {
      module: 'compliance',
      label: 'DPDPA Map',
      score,
      status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
      gap_count: gapCount,
      route_path: '/compliance/map',
    },
  ];
}

export function useDashboard() {
  const org = useComplianceOrg();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const reload = useCallback(async () => {
    if (!org.hasOrg) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const orgId = org.orgIdParam;
      const results = await Promise.allSettled([
        fetchDashboardSummary(orgId),
        fetchModuleHealth(orgId),
        fetchActivityFeed(orgId, 100),
        fetchDeadlines(orgId, 100),
        fetchProcessingTrend(orgId),
        fetchOnboardingStatus(orgId),
        fetchRiskHeatmap(orgId),
        fetchComplianceScoreBreakdown(orgId),
        fetchComplianceScore(orgId),
      ]);

      if (results[0].status === 'rejected') {
        const reason = results[0].reason;
        throw reason instanceof Error ? reason : new Error(String(reason));
      }

      const pick = <T>(index: number, fallback: T): T =>
        results[index].status === 'fulfilled'
          ? ((results[index] as PromiseFulfilledResult<T>).value as T)
          : fallback;

      const summary = results[0].value;
      const complianceBreakdown = pick(7, null);
      const moduleHealth = augmentModuleHealth(pick(1, []), summary, complianceBreakdown);

      setData({
        summary,
        moduleHealth,
        activityFeed: pick(2, []),
        deadlines: pick(3, []),
        processingTrend: pick(4, []),
        onboarding: pick(5, { complete: true, alerts: [] }),
        riskHeatmap: pick(6, []),
        complianceBreakdown,
        complianceScore: pick(8, null),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const recalculate = useCallback(async () => {
    if (!org.hasOrg) return;
    setRecalculating(true);
    try {
      await recalculateComplianceScore(org.orgIdParam);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recalculate failed');
    } finally {
      setRecalculating(false);
    }
  }, [org.hasOrg, org.orgIdParam, reload]);

  return {
    ...org,
    data,
    loading,
    error,
    reload,
    recalculate,
    recalculating,
  };
}
