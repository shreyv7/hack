import { apiFetch } from '@/lib/api/client';
import type {
  EnforcementEvent,
  PropertyEnforcement,
  PropertySigningSecret,
  PurposeDataMapping,
  PurposeDataMappingUpsert,
  PurposeEnforcementConfig,
  PurposeEnforcementConfigUpsert,
  RemediationTaskStatus,
  WithdrawalRemediationSummary,
  WithdrawalRemediationTask,
} from '@/types/enforcement';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchPropertyEnforcement(
  propertyId: string,
  orgId?: string,
): Promise<PropertyEnforcement> {
  return apiFetch<PropertyEnforcement>(
    withOrgQuery(`/enforcement/properties/${propertyId}`, orgId),
  );
}

export function updatePropertyEnforcement(
  propertyId: string,
  enforcement_mode: PropertyEnforcement['enforcement_mode'],
  orgId?: string,
): Promise<PropertyEnforcement> {
  return apiFetch<PropertyEnforcement>(
    withOrgQuery(`/enforcement/properties/${propertyId}`, orgId),
    { method: 'PATCH', body: JSON.stringify({ enforcement_mode }) },
  );
}

export function fetchPropertySigningSecret(
  propertyId: string,
  orgId?: string,
): Promise<PropertySigningSecret> {
  return apiFetch<PropertySigningSecret>(
    withOrgQuery(`/enforcement/properties/${propertyId}/signing-secret`, orgId),
  );
}

export function fetchPurposeEnforcementConfigs(orgId?: string): Promise<PurposeEnforcementConfig[]> {
  return apiFetch<PurposeEnforcementConfig[]>(withOrgQuery('/enforcement/purpose-configs', orgId));
}

export function upsertPurposeEnforcementConfig(
  body: PurposeEnforcementConfigUpsert,
  orgId?: string,
): Promise<PurposeEnforcementConfig> {
  return apiFetch<PurposeEnforcementConfig>(withOrgQuery('/enforcement/purpose-configs', orgId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function fetchPurposeDataMappings(
  orgId?: string,
  purposeId?: string,
): Promise<PurposeDataMapping[]> {
  const q = purposeId ? `?purpose_id=${encodeURIComponent(purposeId)}` : '';
  return apiFetch<PurposeDataMapping[]>(withOrgQuery(`/enforcement/purpose-mappings${q}`, orgId));
}

export function upsertPurposeDataMapping(
  body: PurposeDataMappingUpsert,
  orgId?: string,
): Promise<PurposeDataMapping> {
  return apiFetch<PurposeDataMapping>(withOrgQuery('/enforcement/purpose-mappings', orgId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function deletePurposeDataMapping(mappingId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/enforcement/purpose-mappings/${mappingId}`, orgId), {
    method: 'DELETE',
  });
}

export function fetchEnforcementEvents(
  orgId?: string,
  propertyId?: string,
  limit = 200,
): Promise<EnforcementEvent[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (propertyId) params.set('property_id', propertyId);
  return apiFetch<EnforcementEvent[]>(
    withOrgQuery(`/enforcement/events?${params.toString()}`, orgId),
  );
}

export function fetchRemediationTasks(
  orgId?: string,
  status?: RemediationTaskStatus,
  limit = 100,
): Promise<WithdrawalRemediationTask[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  return apiFetch<WithdrawalRemediationTask[]>(
    withOrgQuery(`/enforcement/remediation-tasks?${params.toString()}`, orgId),
  );
}

export function fetchRemediationSummary(orgId?: string): Promise<WithdrawalRemediationSummary> {
  return apiFetch<WithdrawalRemediationSummary>(
    withOrgQuery('/enforcement/remediation-summary', orgId),
  );
}
