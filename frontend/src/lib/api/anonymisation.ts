import { apiFetch, ApiError, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';
import type {
  AnonymisationJob,
  AnonymisationJobCreate,
  AnonymisationSummary,
  DatasetOption,
  DatasetPreview,
  DownloadJustification,
  DownloadLog,
  RiskPreviewRequest,
  RiskPreviewResult,
} from '@/types/anonymisation';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchAnonymisationSummary(orgId?: string): Promise<AnonymisationSummary> {
  return apiFetch<AnonymisationSummary>(withOrgQuery('/anonymisation/summary', orgId));
}

export function fetchAnonymisationDatasets(orgId?: string): Promise<DatasetOption[]> {
  return apiFetch<DatasetOption[]>(withOrgQuery('/anonymisation/datasets', orgId));
}

export function fetchDatasetPreview(assetId: string, orgId?: string): Promise<DatasetPreview> {
  return apiFetch<DatasetPreview>(
    withOrgQuery(`/anonymisation/datasets/${assetId}/preview`, orgId),
  );
}

export function fetchAnonymisationJobs(orgId?: string): Promise<AnonymisationJob[]> {
  return apiFetch<AnonymisationJob[]>(withOrgQuery('/anonymisation/jobs', orgId));
}

export function fetchAnonymisationJob(jobId: string, orgId?: string): Promise<AnonymisationJob> {
  return apiFetch<AnonymisationJob>(withOrgQuery(`/anonymisation/jobs/${jobId}`, orgId));
}

export function runAnonymisationMaintenance(orgId?: string): Promise<{ reran: number; monitored: number }> {
  return apiFetch<{ reran: number; monitored: number }>(
    withOrgQuery('/anonymisation/run-maintenance', orgId),
    { method: 'POST' },
  );
}

export function createAnonymisationJob(
  body: AnonymisationJobCreate,
  orgId?: string,
): Promise<AnonymisationJob> {
  return apiFetch<AnonymisationJob>(withOrgQuery('/anonymisation/jobs', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function previewAnonymisationRisk(
  body: RiskPreviewRequest,
  orgId?: string,
): Promise<RiskPreviewResult> {
  return apiFetch<RiskPreviewResult>(withOrgQuery('/anonymisation/preview-risk', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function downloadBlob(path: string, fallbackName: string, init?: RequestInit): Promise<void> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const resp = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
    } catch {
      // ignore
    }
    throw new ApiError(resp.status, detail);
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadAnonymisationEvidence(job: AnonymisationJob, orgId?: string): Promise<void> {
  return downloadBlob(
    withOrgQuery(`/anonymisation/jobs/${job.id}/evidence`, orgId),
    `${job.name}_evidence.pdf`,
  );
}

/** Download a completed job's anonymised CSV. Requires a justification, which is
 *  recorded to the audit trail (raw fetch → blob → browser save). */
export function downloadAnonymisationOutput(
  job: AnonymisationJob,
  justification: DownloadJustification,
  orgId?: string,
): Promise<void> {
  return downloadBlob(
    withOrgQuery(`/anonymisation/jobs/${job.id}/download`, orgId),
    job.output_filename || `${job.name}.csv`,
    { method: 'POST', body: JSON.stringify(justification) },
  );
}

export function fetchDownloadLogs(jobId: string, orgId?: string): Promise<DownloadLog[]> {
  return apiFetch<DownloadLog[]>(withOrgQuery(`/anonymisation/jobs/${jobId}/downloads`, orgId));
}
