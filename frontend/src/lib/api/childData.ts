import { apiFetch } from '@/lib/api/client';
import type {
  AutoDetectResult,
  BulkConsentPreview,
  BulkConsentResult,
  BulkRequestConsentBody,
  ChildApiInfo,
  ConsentEvidence,
  ChildDataSummary,
  ChildRecord,
  ChildRecordCreate,
  ChildRecordUpdate,
  ConsentRequestResult,
  EnforcementDecision,
  MaintenanceResult,
  RecordParentalConsent,
  RequestParentalConsentBody,
  RestrictedPurpose,
} from '@/types/childData';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchChildSummary(orgId?: string): Promise<ChildDataSummary> {
  return apiFetch<ChildDataSummary>(withOrgQuery('/childrens-data/summary', orgId));
}

export function fetchChildApiInfo(orgId?: string): Promise<ChildApiInfo> {
  return apiFetch<ChildApiInfo>(withOrgQuery('/childrens-data/api-info', orgId));
}

export function fetchChildRecords(orgId?: string): Promise<ChildRecord[]> {
  return apiFetch<ChildRecord[]>(withOrgQuery('/childrens-data/records', orgId));
}

export function createChildRecord(
  body: ChildRecordCreate,
  orgId?: string
): Promise<ChildRecord> {
  return apiFetch<ChildRecord>(withOrgQuery('/childrens-data/records', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateChildRecord(
  id: string,
  body: ChildRecordUpdate,
  orgId?: string
): Promise<ChildRecord> {
  return apiFetch<ChildRecord>(withOrgQuery(`/childrens-data/records/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteChildRecord(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/childrens-data/records/${id}`, orgId), {
    method: 'DELETE',
  });
}

export function checkEnforcement(
  subjectRef: string,
  purpose: RestrictedPurpose,
  orgId?: string
): Promise<EnforcementDecision> {
  return apiFetch<EnforcementDecision>(withOrgQuery('/childrens-data/enforce', orgId), {
    method: 'POST',
    body: JSON.stringify({ subject_ref: subjectRef, purpose }),
  });
}

export function autoDetectChildren(
  dataSourceId: string,
  options: { table?: string; dobColumn?: string; idColumn?: string; parentEmailColumn?: string } = {},
  orgId?: string
): Promise<AutoDetectResult> {
  return apiFetch<AutoDetectResult>(withOrgQuery('/childrens-data/auto-detect', orgId), {
    method: 'POST',
    body: JSON.stringify({
      data_source_id: dataSourceId,
      table: options.table || null,
      dob_column: options.dobColumn || null,
      id_column: options.idColumn || null,
      parent_email_column: options.parentEmailColumn || null,
    }),
  });
}

export function recordParentalConsent(
  id: string,
  body: RecordParentalConsent,
  orgId?: string
): Promise<ChildRecord> {
  return apiFetch<ChildRecord>(
    withOrgQuery(`/childrens-data/records/${id}/record-consent`, orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function requestParentalConsent(
  id: string,
  body: RequestParentalConsentBody,
  orgId?: string
): Promise<ConsentRequestResult> {
  return apiFetch<ConsentRequestResult>(
    withOrgQuery(`/childrens-data/records/${id}/request-consent`, orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function fetchConsentEvidence(id: string, orgId?: string): Promise<ConsentEvidence> {
  return apiFetch<ConsentEvidence>(
    withOrgQuery(`/childrens-data/records/${id}/evidence`, orgId)
  );
}

export function previewBulkConsent(
  body: BulkRequestConsentBody,
  orgId?: string
): Promise<BulkConsentPreview> {
  return apiFetch<BulkConsentPreview>(
    withOrgQuery('/childrens-data/request-consent/bulk/preview', orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function requestBulkConsent(
  body: BulkRequestConsentBody,
  orgId?: string
): Promise<BulkConsentResult> {
  return apiFetch<BulkConsentResult>(
    withOrgQuery('/childrens-data/request-consent/bulk', orgId),
    { method: 'POST', body: JSON.stringify(body) }
  );
}

export function runChildMaintenance(orgId?: string): Promise<MaintenanceResult> {
  return apiFetch<MaintenanceResult>(
    withOrgQuery('/childrens-data/run-maintenance', orgId),
    { method: 'POST' }
  );
}
