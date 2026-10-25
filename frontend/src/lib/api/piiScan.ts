import { apiFetch } from '@/lib/api/client';
import type {
  BulkDismissRequest,
  BulkDismissResult,
  PiiFinding,
  PiiScanSummary,
  ScanJob,
  ScanJobDetail,
  ScanSchedule,
  ScheduleCreateRequest,
  ScheduleUpdateRequest,
} from '@/types/piiScan';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchPiiSummary(orgId?: string): Promise<PiiScanSummary> {
  return apiFetch<PiiScanSummary>(withOrgQuery('/pii-scanner/summary', orgId));
}

export function startPiiScan(
  dataSourceId: string,
  sampleSize: number,
  orgId?: string
): Promise<ScanJob> {
  return apiFetch<ScanJob>(withOrgQuery('/pii-scanner/scans', orgId), {
    method: 'POST',
    body: JSON.stringify({ data_source_id: dataSourceId, sample_size: sampleSize }),
  });
}

export function fetchScans(orgId?: string): Promise<ScanJob[]> {
  return apiFetch<ScanJob[]>(withOrgQuery('/pii-scanner/scans', orgId));
}

export function fetchScan(jobId: string, orgId?: string): Promise<ScanJobDetail> {
  return apiFetch<ScanJobDetail>(withOrgQuery(`/pii-scanner/scans/${jobId}`, orgId));
}

export function retryScan(jobId: string, orgId?: string): Promise<ScanJob> {
  return apiFetch<ScanJob>(withOrgQuery(`/pii-scanner/scans/${jobId}/retry`, orgId), {
    method: 'POST',
  });
}

export function fetchFindings(
  orgId?: string,
  statusFilter?: string,
  dataSourceId?: string
): Promise<PiiFinding[]> {
  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  if (dataSourceId) params.set('data_source_id', dataSourceId);
  const q = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<PiiFinding[]>(withOrgQuery(`/pii-scanner/findings${q}`, orgId));
}

export function dismissFinding(findingId: string, orgId?: string): Promise<PiiFinding> {
  return apiFetch<PiiFinding>(withOrgQuery(`/pii-scanner/findings/${findingId}/dismiss`, orgId), {
    method: 'POST',
  });
}

export function bulkDismissFindings(
  body: BulkDismissRequest,
  orgId?: string
): Promise<BulkDismissResult> {
  return apiFetch<BulkDismissResult>(withOrgQuery('/pii-scanner/findings/dismiss', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// --- recurring schedules (DPDPA Sec 10 continuous monitoring) ---

export function fetchSchedules(orgId?: string): Promise<ScanSchedule[]> {
  return apiFetch<ScanSchedule[]>(withOrgQuery('/pii-scanner/schedules', orgId));
}

export function createSchedule(body: ScheduleCreateRequest, orgId?: string): Promise<ScanSchedule> {
  return apiFetch<ScanSchedule>(withOrgQuery('/pii-scanner/schedules', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateSchedule(
  scheduleId: string,
  body: ScheduleUpdateRequest,
  orgId?: string
): Promise<ScanSchedule> {
  return apiFetch<ScanSchedule>(withOrgQuery(`/pii-scanner/schedules/${scheduleId}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteSchedule(scheduleId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/pii-scanner/schedules/${scheduleId}`, orgId), {
    method: 'DELETE',
  });
}
