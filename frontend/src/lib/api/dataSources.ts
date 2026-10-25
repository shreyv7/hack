import { apiFetch, ApiError, getApiBaseUrl } from '@/lib/api/client';
import { getAccessToken } from '@/lib/auth/storage';
import type {
  ConnectionTestResult,
  DataSource,
  DataSourceActivityEntry,
  DataSourceCreate,
  DataSourceUpdate,
  DataSourceUsageSummary,
} from '@/types/dataSource';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchDataSources(orgId?: string): Promise<DataSource[]> {
  return apiFetch<DataSource[]>(withOrgQuery('/data-sources', orgId));
}

export function fetchDataSource(id: string, orgId?: string): Promise<DataSource> {
  return apiFetch<DataSource>(withOrgQuery(`/data-sources/${id}`, orgId));
}

export function createDataSource(body: DataSourceCreate, orgId?: string): Promise<DataSource> {
  return apiFetch<DataSource>(withOrgQuery('/data-sources', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateDataSource(
  id: string,
  body: DataSourceUpdate,
  orgId?: string
): Promise<DataSource> {
  return apiFetch<DataSource>(withOrgQuery(`/data-sources/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteDataSource(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/data-sources/${id}`, orgId), { method: 'DELETE' });
}

export function testDataSourceConnection(
  id: string,
  orgId?: string
): Promise<ConnectionTestResult> {
  return apiFetch<ConnectionTestResult>(
    withOrgQuery(`/data-sources/${id}/test-connection`, orgId),
    { method: 'POST' }
  );
}

export function fetchDataSourceUsageSummary(
  id: string,
  orgId?: string
): Promise<DataSourceUsageSummary> {
  return apiFetch<DataSourceUsageSummary>(
    withOrgQuery(`/data-sources/${id}/usage-summary`, orgId)
  );
}

export function fetchDataSourceActivity(
  id: string,
  orgId?: string
): Promise<DataSourceActivityEntry[]> {
  return apiFetch<DataSourceActivityEntry[]>(
    withOrgQuery(`/data-sources/${id}/activity`, orgId)
  );
}

export function logDataSourceSchemaScan(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/data-sources/${id}/log-schema-scan`, orgId), {
    method: 'POST',
  });
}

export function rotateDataSourceCredential(
  id: string,
  password: string,
  orgId?: string
): Promise<DataSource> {
  return apiFetch<DataSource>(withOrgQuery(`/data-sources/${id}/rotate-credential`, orgId), {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

/**
 * Upload a file as a data source. Uses raw fetch (not apiFetch) so the browser
 * sets the multipart Content-Type boundary itself.
 */
export async function uploadDataSourceFile(
  file: File,
  meta: { name?: string; description?: string },
  orgId?: string
): Promise<DataSource> {
  const form = new FormData();
  form.append('file', file);
  if (meta.name) form.append('name', meta.name);
  if (meta.description) form.append('description', meta.description);

  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${getApiBaseUrl()}${withOrgQuery('/data-sources/upload', orgId)}`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') detail = body.detail;
      else if (body.detail !== undefined) detail = JSON.stringify(body.detail);
    } catch {
      // ignore parse errors
    }
    throw new ApiError(response.status, detail);
  }

  return response.json() as Promise<DataSource>;
}
