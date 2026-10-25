import { apiFetch } from '@/lib/api/client';
import type {
  ObligationApiInfo,
  ObligationCreate,
  ObligationStatus,
  ObligationSummary,
  PolicyCreate,
  PolicyImpact,
  PolicyUpdate,
  RetentionEngineResult,
  RetentionIndustryPresets,
  RetentionObligation,
  RetentionPolicy,
  RetentionRun,
  RetentionSummary,
} from '@/types/retention';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchRetentionSummary(orgId?: string): Promise<RetentionSummary> {
  return apiFetch<RetentionSummary>(withOrgQuery('/retention/summary', orgId));
}

export function fetchRetentionIndustryPresets(orgId?: string): Promise<RetentionIndustryPresets> {
  return apiFetch<RetentionIndustryPresets>(withOrgQuery('/retention/industry-presets', orgId));
}

export function fetchPolicies(orgId?: string): Promise<RetentionPolicy[]> {
  return apiFetch<RetentionPolicy[]>(withOrgQuery('/retention/policies', orgId));
}

export function createPolicy(body: PolicyCreate, orgId?: string): Promise<RetentionPolicy> {
  return apiFetch<RetentionPolicy>(withOrgQuery('/retention/policies', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePolicy(
  id: string,
  body: PolicyUpdate,
  orgId?: string
): Promise<RetentionPolicy> {
  return apiFetch<RetentionPolicy>(withOrgQuery(`/retention/policies/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deletePolicy(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/retention/policies/${id}`, orgId), { method: 'DELETE' });
}

export function runPolicy(id: string, orgId?: string): Promise<RetentionRun> {
  return apiFetch<RetentionRun>(withOrgQuery(`/retention/policies/${id}/run`, orgId), {
    method: 'POST',
  });
}

export function fetchPolicyImpact(id: string, orgId?: string): Promise<PolicyImpact> {
  return apiFetch<PolicyImpact>(withOrgQuery(`/retention/policies/${id}/impact`, orgId));
}

export function fetchRuns(orgId?: string, policyId?: string): Promise<RetentionRun[]> {
  const q = policyId ? `?policy_id=${encodeURIComponent(policyId)}` : '';
  return apiFetch<RetentionRun[]>(withOrgQuery(`/retention/runs${q}`, orgId));
}

export function confirmRun(runId: string, orgId?: string): Promise<RetentionRun> {
  return apiFetch<RetentionRun>(withOrgQuery(`/retention/runs/${runId}/confirm`, orgId), {
    method: 'POST',
  });
}

export function executeRun(runId: string, orgId?: string): Promise<RetentionRun> {
  return apiFetch<RetentionRun>(withOrgQuery(`/retention/runs/${runId}/execute`, orgId), {
    method: 'POST',
  });
}

export function runDuePolicies(orgId?: string): Promise<RetentionEngineResult> {
  return apiFetch<RetentionEngineResult>(withOrgQuery('/retention/admin/run-due', orgId), {
    method: 'POST',
  });
}

// --- application-level obligations (Stage 4) ---

export function fetchObligations(
  orgId?: string,
  statusFilter?: ObligationStatus
): Promise<RetentionObligation[]> {
  const q = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return apiFetch<RetentionObligation[]>(withOrgQuery(`/retention/obligations${q}`, orgId));
}

export function fetchObligationSummary(orgId?: string): Promise<ObligationSummary> {
  return apiFetch<ObligationSummary>(withOrgQuery('/retention/obligations/summary', orgId));
}

export function fetchObligationApiInfo(orgId?: string): Promise<ObligationApiInfo> {
  return apiFetch<ObligationApiInfo>(withOrgQuery('/retention/obligations/api-info', orgId));
}

export function createObligation(
  body: ObligationCreate,
  orgId?: string
): Promise<RetentionObligation> {
  return apiFetch<RetentionObligation>(withOrgQuery('/retention/obligations', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fulfillObligation(id: string, orgId?: string): Promise<RetentionObligation> {
  return apiFetch<RetentionObligation>(
    withOrgQuery(`/retention/obligations/${id}/fulfill`, orgId),
    { method: 'POST', body: JSON.stringify({}) }
  );
}

export function cancelObligation(id: string, orgId?: string): Promise<RetentionObligation> {
  return apiFetch<RetentionObligation>(
    withOrgQuery(`/retention/obligations/${id}/cancel`, orgId),
    { method: 'POST' }
  );
}
