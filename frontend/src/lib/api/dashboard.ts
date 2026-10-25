import { apiFetch } from '@/lib/api/client';
import type {
  ActivityFeedItem,
  AutomationCoverage,
  ComplianceScore,
  ComplianceScoreBreakdown,
  ComplianceScoreTrend,
  DashboardSummary,
  DeadlineItem,
  ModuleHealthItem,
  OnboardingStatus,
  ProcessingTrendPoint,
  RiskHeatmapCell,
} from '@/types/dashboard';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchDashboardSummary(orgId?: string): Promise<DashboardSummary> {
  return apiFetch(withOrgQuery('/dashboard/summary', orgId));
}

export function fetchModuleHealth(orgId?: string): Promise<ModuleHealthItem[]> {
  return apiFetch(withOrgQuery('/dashboard/module-health', orgId));
}

export function fetchActivityFeed(orgId?: string, limit = 20): Promise<ActivityFeedItem[]> {
  return apiFetch(withOrgQuery(`/dashboard/activity-feed?limit=${limit}`, orgId));
}

export function fetchDeadlines(orgId?: string, limit = 10): Promise<DeadlineItem[]> {
  return apiFetch(withOrgQuery(`/dashboard/deadlines?limit=${limit}`, orgId));
}

export function fetchProcessingTrend(orgId?: string, months = 6): Promise<ProcessingTrendPoint[]> {
  return apiFetch(withOrgQuery(`/dashboard/processing-trend?months=${months}`, orgId));
}

export function fetchOnboardingStatus(orgId?: string): Promise<OnboardingStatus> {
  return apiFetch(withOrgQuery('/dashboard/onboarding-status', orgId));
}

export function fetchRiskHeatmap(orgId?: string): Promise<RiskHeatmapCell[]> {
  return apiFetch(withOrgQuery('/dashboard/risk-heatmap', orgId));
}

export function fetchComplianceScore(orgId?: string): Promise<ComplianceScore> {
  return apiFetch(withOrgQuery('/compliance/score', orgId));
}

export function fetchComplianceScoreBreakdown(orgId?: string): Promise<ComplianceScoreBreakdown> {
  return apiFetch(withOrgQuery('/compliance/score/breakdown', orgId));
}

export function fetchComplianceScoreTrend(orgId?: string, days = 90): Promise<ComplianceScoreTrend> {
  return apiFetch(withOrgQuery(`/compliance/score/trend?days=${days}`, orgId));
}

export function recalculateComplianceScore(orgId?: string): Promise<ComplianceScore> {
  return apiFetch(withOrgQuery('/compliance/score/recalculate', orgId), { method: 'POST' });
}

export function fetchAutomationCoverage(orgId?: string): Promise<AutomationCoverage> {
  return apiFetch(withOrgQuery('/overview/automation-coverage', orgId));
}
