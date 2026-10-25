import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';

export interface LegitimateUseRecord {
  id: string;
  organization_id: string;
  title: string;
  ground_type: string;
  legal_rationale: string;
  approver_name: string | null;
  approver_user_id: string | null;
  retention_basis: string | null;
  downstream_sharing: string | null;
  review_date: string | null;
  exemption_tags: string[];
  evidence_refs: string[];
  status: string;
  ropa_activity_id: string | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegitimateUseSummary {
  total_records: number;
  active_records: number;
  under_review_records: number;
  due_for_review: number;
}

export interface LegitimateUseMarkReviewedPayload {
  review_date?: string | null;
  notes?: string | null;
}

function withOrg(path: string, orgId?: string) {
  if (!orgId) return path;
  return `${path}?org_id=${encodeURIComponent(orgId)}`;
}

export function fetchLegitimateUseRecords(orgId?: string): Promise<LegitimateUseRecord[]> {
  return apiFetch(withOrg('/legitimate-use', orgId));
}

export function fetchLegitimateUseSummary(orgId?: string): Promise<LegitimateUseSummary> {
  return apiFetch(withOrg('/legitimate-use/summary', orgId));
}

export function createLegitimateUseRecord(
  body: Partial<LegitimateUseRecord>,
  orgId?: string
): Promise<LegitimateUseRecord> {
  return apiFetch(withOrg('/legitimate-use', orgId), { method: 'POST', body: JSON.stringify(body) });
}

export function updateLegitimateUseRecord(
  id: string,
  body: Partial<LegitimateUseRecord>,
  orgId?: string
): Promise<LegitimateUseRecord> {
  return apiFetch(withOrg(`/legitimate-use/${id}`, orgId), { method: 'PATCH', body: JSON.stringify(body) });
}

export function markLegitimateUseReviewed(
  id: string,
  body: LegitimateUseMarkReviewedPayload,
  orgId?: string
): Promise<LegitimateUseRecord> {
  return apiFetch(withOrg(`/legitimate-use/${id}/mark-reviewed`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function deleteLegitimateUseRecord(id: string, orgId?: string): Promise<void> {
  return apiFetch(withOrg(`/legitimate-use/${id}`, orgId), { method: 'DELETE' });
}

export async function downloadLegitimateUseExport(orgId?: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${withOrg('/legitimate-use/export', orgId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error('Failed to export legitimate use register');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'legitimate-use-register.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
