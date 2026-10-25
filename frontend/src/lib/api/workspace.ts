import { apiFetch } from '@/lib/api/client';
import type {
  DataProcessor,
  DataProcessorCreate,
  DataProcessorUpdate,
  DiscoveredProcessor,
  DpdpObligation,
  WorkspaceDeploymentUpdate,
  WorkspaceIndustryUpdate,
  WorkspaceProfileUpdate,
  WorkspaceRoleMappingUpdate,
  WorkspaceSettings,
  SetupStatus,
} from '@/types/workspace';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchWorkspace(orgId?: string): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(withOrgQuery('/workspace', orgId));
}

export function patchWorkspaceProfile(
  body: WorkspaceProfileUpdate,
  orgId?: string
): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(withOrgQuery('/workspace/profile', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function patchWorkspaceIndustry(
  body: WorkspaceIndustryUpdate,
  orgId?: string
): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(withOrgQuery('/workspace/industry', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function patchWorkspaceDeployment(
  body: WorkspaceDeploymentUpdate,
  orgId?: string
): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(withOrgQuery('/workspace/deployment', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function patchWorkspaceRoleMapping(
  body: WorkspaceRoleMappingUpdate,
  orgId?: string
): Promise<WorkspaceSettings> {
  return apiFetch<WorkspaceSettings>(withOrgQuery('/workspace/role-mapping', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchObligations(): Promise<DpdpObligation[]> {
  return apiFetch<DpdpObligation[]>('/workspace/obligations');
}

export function fetchProcessors(orgId?: string): Promise<DataProcessor[]> {
  return apiFetch<DataProcessor[]>(withOrgQuery('/workspace/processors', orgId));
}

export function createProcessor(body: DataProcessorCreate, orgId?: string): Promise<DataProcessor> {
  return apiFetch<DataProcessor>(withOrgQuery('/workspace/processors', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProcessor(
  id: string,
  body: DataProcessorUpdate,
  orgId?: string
): Promise<DataProcessor> {
  return apiFetch<DataProcessor>(withOrgQuery(`/workspace/processors/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteProcessor(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/workspace/processors/${id}`, orgId), { method: 'DELETE' });
}

export function fetchDiscoveredProcessors(orgId?: string): Promise<DiscoveredProcessor[]> {
  return apiFetch<DiscoveredProcessor[]>(withOrgQuery('/workspace/processors/discovered', orgId));
}

export function scanDiscoveredProcessors(orgId?: string): Promise<DiscoveredProcessor[]> {
  return apiFetch<DiscoveredProcessor[]>(withOrgQuery('/workspace/processors/discovered/scan', orgId), {
    method: 'POST',
  });
}

export function blockDiscoveredProcessor(name: string, orgId?: string): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(
    withOrgQuery(`/workspace/processors/discovered/${encodeURIComponent(name)}/block`, orgId),
    { method: 'POST' }
  );
}

export function investigateDiscoveredProcessor(
  name: string,
  orgId?: string
): Promise<{ report: string }> {
  return apiFetch<{ report: string }>(
    withOrgQuery(`/workspace/processors/discovered/${encodeURIComponent(name)}/investigate`, orgId),
    { method: 'POST' }
  );
}

export function fetchVendorDataFlows(
  processorId: string,
  orgId?: string
): Promise<Array<{ activity_ref: string; title: string; recipient_type: string; data_shared: string }>> {
  return apiFetch<
    Array<{ activity_ref: string; title: string; recipient_type: string; data_shared: string }>
  >(withOrgQuery(`/workspace/processors/${processorId}/data-flows`, orgId));
}

export function fetchVendorEvidence(
  processorId: string
): Promise<Array<{ id: string; name: string; file_name: string; file_type: string; is_verified: boolean; verified_at: string | null }>> {
  return apiFetch<
    Array<{ id: string; name: string; file_name: string; file_type: string; is_verified: boolean; verified_at: string | null }>
  >(`/workspace/processors/${processorId}/evidence`);
}

export function linkVendorEvidence(
  processorId: string,
  evidenceId: string,
  orgId?: string
): Promise<void> {
  return apiFetch<void>(
    withOrgQuery(`/workspace/processors/${processorId}/evidence/${evidenceId}`, orgId),
    { method: 'POST' }
  );
}

export function triggerVendorAssessment(
  processorId: string,
  orgId?: string
): Promise<{ status: string }> {
  return apiFetch<{ status: string }>(
    withOrgQuery(`/workspace/processors/${processorId}/assessments/trigger`, orgId),
    { method: 'POST' }
  );
}

export function submitVendorAssessment(
  processorId: string,
  answers: Record<string, boolean>,
  orgId?: string
): Promise<{ security_score: number; tier: string; assessment_status: string; assessment_completed_at: string | null }> {
  return apiFetch<{ security_score: number; tier: string; assessment_status: string; assessment_completed_at: string | null }>(
    withOrgQuery(`/workspace/processors/${processorId}/assessments/submit`, orgId),
    {
      method: 'POST',
      body: JSON.stringify(answers),
    }
  );
}

export function runVendorMonitorCheck(
  processorId: string,
  orgId?: string
): Promise<{
  monitoring_status: string;
  last_monitored_at: string;
  monitoring_details: Record<string, any>;
  security_score: number;
  tier: string;
}> {
  return apiFetch<{
    monitoring_status: string;
    last_monitored_at: string;
    monitoring_details: Record<string, any>;
    security_score: number;
    tier: string;
  }>(withOrgQuery(`/workspace/processors/${processorId}/monitor-check`, orgId), { method: 'POST' });
}

export function fetchSetupStatus(orgId?: string): Promise<SetupStatus> {
  return apiFetch<SetupStatus>(withOrgQuery('/workspace/setup-status', orgId));
}


