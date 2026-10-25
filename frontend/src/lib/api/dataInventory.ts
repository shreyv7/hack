import { apiFetch, getApiBaseUrl } from '@/lib/api/client';
import type {
  ActivityLink,
  ActivityLinkCreate,
  AssetCreate,
  AssetUpdate,
  AssetUsageMap,
  AuditLogEntry,
  BulkStatusResult,
  BulkStatusUpdate,
  FieldCreate,
  FieldUpdate,
  InventoryAsset,
  InventoryAssetDetail,
  InventoryField,
  InventorySummary,
  ProcessorLink,
  ProcessorLinkCreate,
  SchemaImportResult,
} from '@/types/dataInventory';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchInventorySummary(orgId?: string): Promise<InventorySummary> {
  return apiFetch<InventorySummary>(withOrgQuery('/data-inventory/summary', orgId));
}

export function fetchAssets(orgId?: string, dataSourceId?: string): Promise<InventoryAsset[]> {
  const q = dataSourceId ? `?data_source_id=${encodeURIComponent(dataSourceId)}` : '';
  return apiFetch<InventoryAsset[]>(withOrgQuery(`/data-inventory/assets${q}`, orgId));
}

export function fetchAsset(id: string, orgId?: string): Promise<InventoryAssetDetail> {
  return apiFetch<InventoryAssetDetail>(withOrgQuery(`/data-inventory/assets/${id}`, orgId));
}

export function createAsset(body: AssetCreate, orgId?: string): Promise<InventoryAssetDetail> {
  return apiFetch<InventoryAssetDetail>(withOrgQuery('/data-inventory/assets', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateAsset(
  id: string,
  body: AssetUpdate,
  orgId?: string
): Promise<InventoryAssetDetail> {
  return apiFetch<InventoryAssetDetail>(withOrgQuery(`/data-inventory/assets/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function bulkUpdateAssetStatus(
  body: BulkStatusUpdate,
  orgId?: string
): Promise<BulkStatusResult> {
  return apiFetch<BulkStatusResult>(withOrgQuery('/data-inventory/assets/bulk-status', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteAsset(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/data-inventory/assets/${id}`, orgId), { method: 'DELETE' });
}

export function fetchAssetUsage(assetId: string, orgId?: string): Promise<AssetUsageMap> {
  return apiFetch<AssetUsageMap>(withOrgQuery(`/data-inventory/assets/${assetId}/usage`, orgId));
}

export function fetchAssetAuditLog(
  assetId: string,
  orgId?: string,
  limit = 100
): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>(
    withOrgQuery(`/data-inventory/assets/${assetId}/audit-log?limit=${limit}`, orgId)
  );
}

export function fetchAssetProcessors(assetId: string, orgId?: string): Promise<ProcessorLink[]> {
  return apiFetch<ProcessorLink[]>(
    withOrgQuery(`/data-inventory/assets/${assetId}/processors`, orgId)
  );
}

export function linkAssetProcessor(
  assetId: string,
  body: ProcessorLinkCreate,
  orgId?: string
): Promise<ProcessorLink> {
  return apiFetch<ProcessorLink>(
    withOrgQuery(`/data-inventory/assets/${assetId}/processors`, orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function unlinkAssetProcessor(
  assetId: string,
  linkId: string,
  orgId?: string
): Promise<void> {
  return apiFetch<void>(
    withOrgQuery(`/data-inventory/assets/${assetId}/processors/${linkId}`, orgId),
    { method: 'DELETE' }
  );
}

export function fetchAssetActivities(assetId: string, orgId?: string): Promise<ActivityLink[]> {
  return apiFetch<ActivityLink[]>(
    withOrgQuery(`/data-inventory/assets/${assetId}/activities`, orgId)
  );
}

export function linkAssetActivity(
  assetId: string,
  body: ActivityLinkCreate,
  orgId?: string
): Promise<ActivityLink> {
  return apiFetch<ActivityLink>(
    withOrgQuery(`/data-inventory/assets/${assetId}/activities`, orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function unlinkAssetActivity(
  assetId: string,
  linkId: string,
  orgId?: string
): Promise<void> {
  return apiFetch<void>(
    withOrgQuery(`/data-inventory/assets/${assetId}/activities/${linkId}`, orgId),
    { method: 'DELETE' }
  );
}

export function addField(
  assetId: string,
  body: FieldCreate,
  orgId?: string
): Promise<InventoryField> {
  return apiFetch<InventoryField>(
    withOrgQuery(`/data-inventory/assets/${assetId}/fields`, orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function updateField(
  fieldId: string,
  body: FieldUpdate,
  orgId?: string
): Promise<InventoryField> {
  return apiFetch<InventoryField>(withOrgQuery(`/data-inventory/fields/${fieldId}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteField(fieldId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/data-inventory/fields/${fieldId}`, orgId), {
    method: 'DELETE',
  });
}

export function importSchemaFromSource(
  sourceId: string,
  orgId?: string
): Promise<SchemaImportResult> {
  return apiFetch<SchemaImportResult>(
    withOrgQuery(`/data-inventory/sources/${sourceId}/import-schema`, orgId),
    { method: 'POST' }
  );
}

export async function exportInventoryCsv(orgId?: string): Promise<void> {
  const path = withOrgQuery('/data-inventory/export', orgId);
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'data-inventory-export.csv';
  a.click();
  URL.revokeObjectURL(url);
}
