import { useCallback, useEffect, useState } from 'react';
import {
  fetchComplianceScore,
  fetchComplianceScoreBreakdown,
  fetchComplianceScoreTrend,
  recalculateComplianceScore,
} from '@/lib/api/dashboard';
import type { ComplianceScore, ComplianceScoreBreakdown, ComplianceScoreTrend } from '@/types/dashboard';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';

export function useComplianceScore() {
  const org = useComplianceOrg();
  const [score, setScore] = useState<ComplianceScore | null>(null);
  const [breakdown, setBreakdown] = useState<ComplianceScoreBreakdown | null>(null);
  const [trend, setTrend] = useState<ComplianceScoreTrend | null>(null);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const reload = useCallback(async () => {
    if (!org.hasOrg) {
      setScore(null);
      setBreakdown(null);
      setTrend(null);
      setTrendError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const orgId = org.orgIdParam;
      const [scoreResult, breakdownResult, trendResult] = await Promise.allSettled([
        fetchComplianceScore(orgId),
        fetchComplianceScoreBreakdown(orgId),
        fetchComplianceScoreTrend(orgId),
      ]);

      if (scoreResult.status === 'rejected') {
        throw scoreResult.reason;
      }

      setScore(scoreResult.value);
      setBreakdown(breakdownResult.status === 'fulfilled' ? breakdownResult.value : { sections: [] });
      if (trendResult.status === 'fulfilled') {
        setTrend(trendResult.value);
        setTrendError(null);
      } else {
        setTrend({ points: [] });
        setTrendError(
          trendResult.reason instanceof Error
            ? trendResult.reason.message
            : 'Failed to load compliance trend',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load compliance score');
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
      const updated = await recalculateComplianceScore(org.orgIdParam);
      setScore(updated);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Recalculate failed');
    } finally {
      setRecalculating(false);
    }
  }, [org.hasOrg, org.orgIdParam, reload]);

  return {
    ...org,
    score,
    breakdown,
    trend,
    trendError,
    loading,
    error,
    reload,
    recalculate,
    recalculating,
  };
}
