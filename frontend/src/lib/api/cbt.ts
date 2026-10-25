import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';
import type {
  CbtTransfer,
  CbtContract,
  CbtContractDetail,
  CbtContractVersion,
  CbtSdfAssessment,
  CbtActivity,
  CbtDashboardKpis,
} from '@/types/cross_border_transfer';
import type { NoticeCampaign } from '@/lib/api/noticeDelivery';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchCbtDashboard(orgId?: string): Promise<CbtDashboardKpis> {
  return apiFetch<CbtDashboardKpis>(withOrgQuery('/cbt/dashboard', orgId));
}

export function fetchCbtTransfers(orgId?: string): Promise<CbtTransfer[]> {
  return apiFetch<CbtTransfer[]>(withOrgQuery('/cbt/transfers', orgId));
}

export function fetchCbtTransfer(id: string, orgId?: string): Promise<CbtTransfer> {
  return apiFetch<CbtTransfer>(withOrgQuery(`/cbt/transfers/${id}`, orgId));
}

export function createCbtTransfer(body: any, orgId?: string): Promise<CbtTransfer> {
  return apiFetch<CbtTransfer>(withOrgQuery('/cbt/transfers', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateCbtTransfer(id: string, body: any, orgId?: string): Promise<CbtTransfer> {
  return apiFetch<CbtTransfer>(withOrgQuery(`/cbt/transfers/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteCbtTransfer(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/cbt/transfers/${id}`, orgId), {
    method: 'DELETE',
  });
}

// --- Contracts ---

export function fetchCbtContracts(transferId: string, orgId?: string): Promise<CbtContract[]> {
  return apiFetch<CbtContract[]>(withOrgQuery(`/cbt/transfers/${transferId}/contracts`, orgId));
}

export function createCbtContract(transferId: string, body: any, orgId?: string): Promise<CbtContract> {
  return apiFetch<CbtContract>(withOrgQuery(`/cbt/transfers/${transferId}/contracts`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchCbtContract(id: string, orgId?: string): Promise<CbtContractDetail> {
  return apiFetch<CbtContractDetail>(withOrgQuery(`/cbt/contracts/${id}`, orgId));
}

export function addCbtContractVersion(contractId: string, body: any, orgId?: string): Promise<CbtContractVersion> {
  return apiFetch<CbtContractVersion>(withOrgQuery(`/cbt/contracts/${contractId}/versions`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function signCbtContract(contractId: string, versionId: string, orgId?: string): Promise<CbtContract> {
  return apiFetch<CbtContract>(withOrgQuery(`/cbt/contracts/${contractId}/sign/${versionId}`, orgId), {
    method: 'POST',
  });
}

export function getContractPdfUrl(contractId: string, versionId: string, orgId?: string): string {
  const baseUrl = getApiBaseUrl();
  const token = getAccessToken();
  const orgQuery = orgId ? `&org_id=${encodeURIComponent(orgId)}` : '';
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  
  // Using direct link since a GET endpoint can download via browser, or via fetching.
  // We can pass token in headers or via query param. If backend require_role dependency is used, 
  // browser GET request might not pass Authorization header unless we open it. So let's provide a function to fetch
  // and download as Blob, or pass token in query if backend supports it. But standard way is fetch Blob.
  return `${baseUrl}/cbt/contracts/${contractId}/versions/${versionId}/pdf${tokenQuery}${orgQuery}`;
}

export async function downloadContractPdf(contractId: string, versionId: string, orgId?: string): Promise<Blob> {
  const url = `/cbt/contracts/${contractId}/versions/${versionId}/pdf`;
  const token = getAccessToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const baseUrl = getApiBaseUrl();
  const fullUrl = `${baseUrl}${withOrgQuery(url, orgId)}`;
  
  const res = await fetch(fullUrl, { headers });
  if (!res.ok) {
    throw new Error('Failed to download PDF');
  }
  return res.blob();
}

// --- Notice Campaign ---

export function triggerCbtNoticeCampaign(transferId: string, orgId?: string): Promise<NoticeCampaign> {
  return apiFetch<NoticeCampaign>(withOrgQuery(`/cbt/transfers/${transferId}/notices`, orgId), {
    method: 'POST',
  });
}

// --- SDF Assessments ---

export function createCbtSdfAssessment(transferId: string, body: any, orgId?: string): Promise<CbtSdfAssessment> {
  return apiFetch<CbtSdfAssessment>(withOrgQuery(`/cbt/transfers/${transferId}/sdf-assessments`, orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchCbtSdfAssessments(transferId: string, orgId?: string): Promise<CbtSdfAssessment[]> {
  return apiFetch<CbtSdfAssessment[]>(withOrgQuery(`/cbt/transfers/${transferId}/sdf-assessments`, orgId));
}

// --- Activities ---

export function fetchCbtActivities(orgId?: string, transferId?: string): Promise<CbtActivity[]> {
  let path = '/cbt/activities';
  if (transferId) {
    path = `${path}?transfer_id=${encodeURIComponent(transferId)}`;
  }
  return apiFetch<CbtActivity[]>(withOrgQuery(path, orgId));
}
