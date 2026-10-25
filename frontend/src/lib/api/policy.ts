import { apiFetch } from '@/lib/api/client';
import type {
  PolicyStats,
  PolicySummary,
  PolicyDetail,
  PolicyVersion,
  AcknowledgementSummary,
  PolicyActivity,
  PolicyGenerateFromRopaResult,
  PolicyType,
} from '@/types/policy';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchPolicyStats(orgId?: string): Promise<PolicyStats> {
  return apiFetch<PolicyStats>(withOrgQuery('/policy/stats', orgId));
}

export function fetchPolicies(orgId?: string, includeArchived = false): Promise<PolicySummary[]> {
  const q = includeArchived ? '?include_archived=true' : '';
  return apiFetch<PolicySummary[]>(withOrgQuery(`/policy/policies${q}`, orgId));
}

export function fetchPolicy(id: string, orgId?: string): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(withOrgQuery(`/policy/policies/${id}`, orgId));
}

export function createPolicy(
  body: { title: string; policy_type: string; content?: string; summary?: string },
  orgId?: string
): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(withOrgQuery('/policy/policies', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePolicy(
  id: string,
  body: { title?: string; policy_type?: string },
  orgId?: string
): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(withOrgQuery(`/policy/policies/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function archivePolicy(id: string, orgId?: string): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(withOrgQuery(`/policy/policies/${id}/archive`, orgId), {
    method: 'POST',
  });
}

export function unarchivePolicy(id: string, orgId?: string): Promise<PolicyDetail> {
  return apiFetch<PolicyDetail>(withOrgQuery(`/policy/policies/${id}/unarchive`, orgId), {
    method: 'POST',
  });
}

export function createPolicyVersion(
  id: string,
  body: { content: string; summary?: string; effective_date?: string },
  orgId?: string
): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(withOrgQuery(`/policy/policies/${id}/versions`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePolicyVersion(
  id: string,
  vid: string,
  body: { content?: string; summary?: string; effective_date?: string },
  orgId?: string
): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(withOrgQuery(`/policy/policies/${id}/versions/${vid}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function submitForReview(id: string, vid: string, orgId?: string): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(
    withOrgQuery(`/policy/policies/${id}/versions/${vid}/submit-review`, orgId),
    { method: 'POST' }
  );
}

export function approveVersion(id: string, vid: string, orgId?: string): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(
    withOrgQuery(`/policy/policies/${id}/versions/${vid}/approve`, orgId),
    { method: 'POST' }
  );
}

export function publishVersion(id: string, vid: string, orgId?: string): Promise<PolicyVersion> {
  return apiFetch<PolicyVersion>(
    withOrgQuery(`/policy/policies/${id}/versions/${vid}/publish`, orgId),
    { method: 'POST' }
  );
}

export function fetchAcknowledgements(orgId?: string): Promise<AcknowledgementSummary[]> {
  return apiFetch<AcknowledgementSummary[]>(withOrgQuery('/policy/acknowledgements', orgId));
}

export function sendReminder(
  policyId: string,
  versionId?: string,
  channel?: string,
  orgId?: string
): Promise<{ policy_title: string; version: string; sent_count: number }> {
  return apiFetch<{ policy_title: string; version: string; sent_count: number }>(
    withOrgQuery('/policy/acknowledgements/send-reminder', orgId),
    {
      method: 'POST',
      body: JSON.stringify({ policy_id: policyId, version_id: versionId, channel }),
    }
  );
}

export function fetchPolicyActivities(orgId?: string): Promise<PolicyActivity[]> {
  return apiFetch<PolicyActivity[]>(withOrgQuery('/policy/activities', orgId));
}

export function generatePolicyFromRopa(
  policyType: PolicyType = 'privacy',
  orgId?: string
): Promise<PolicyGenerateFromRopaResult> {
  return apiFetch<PolicyGenerateFromRopaResult>(withOrgQuery('/policy/generate-from-ropa', orgId), {
    method: 'POST',
    body: JSON.stringify({ policy_type: policyType }),
  });
}
