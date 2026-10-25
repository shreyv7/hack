import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';

export interface RegulatoryProceeding {
  id: string;
  organization_id?: string;
  proceeding_ref: string;
  proceeding_type: string;
  status: string;
  title: string;
  description: string | null;
  board_reference: string | null;
  penalty_exposure_crores: number | null;
  due_at: string | null;
  submitted_at: string | null;
  closed_at: string | null;
  assigned_to_user_id: string | null;
  evidence_pack: Array<Record<string, unknown>>;
  correspondence_log: Array<Record<string, unknown>>;
  linked_breach_id: string | null;
  linked_audit_refs: string[];
  created_at?: string;
  updated_at?: string;
}

export interface RegulatoryProceedingSummary {
  open_count: number;
  in_progress_count: number;
  overdue_count: number;
  due_soon_count: number;
  closed_count: number;
  total_penalty_exposure_crores: number;
}

export interface RegulatoryCorrespondencePayload {
  direction: string;
  subject: string;
  summary: string;
  author?: string | null;
}

function withOrg(path: string, orgId?: string) {
  if (!orgId) return path;
  return `${path}?org_id=${encodeURIComponent(orgId)}`;
}

export function fetchRegulatoryProceedings(orgId?: string): Promise<RegulatoryProceeding[]> {
  return apiFetch(withOrg('/regulatory-proceedings', orgId));
}

export function fetchRegulatoryProceedingSummary(orgId?: string): Promise<RegulatoryProceedingSummary> {
  return apiFetch(withOrg('/regulatory-proceedings/summary', orgId));
}

export function createRegulatoryProceeding(
  body: Partial<RegulatoryProceeding>,
  orgId?: string
): Promise<RegulatoryProceeding> {
  return apiFetch(withOrg('/regulatory-proceedings', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateRegulatoryProceeding(
  id: string,
  body: Partial<RegulatoryProceeding>,
  orgId?: string
): Promise<RegulatoryProceeding> {
  return apiFetch(withOrg(`/regulatory-proceedings/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function addRegulatoryCorrespondence(
  proceedingId: string,
  body: RegulatoryCorrespondencePayload,
  orgId?: string
): Promise<RegulatoryProceeding> {
  return apiFetch(withOrg(`/regulatory-proceedings/${proceedingId}/correspondence`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function assembleRegulatoryEvidence(proceedingId: string, orgId?: string): Promise<RegulatoryProceeding> {
  return apiFetch(withOrg(`/regulatory-proceedings/${proceedingId}/assemble-evidence`, orgId), {
    method: 'POST',
  });
}

export async function downloadRegulatoryProceedingsExport(orgId?: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(`${getApiBaseUrl()}${withOrg('/regulatory-proceedings/export', orgId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error('Failed to export regulatory proceedings register');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'regulatory-proceedings-register.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
