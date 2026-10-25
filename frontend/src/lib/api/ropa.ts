import { apiFetch, ApiError, getApiBaseUrl } from './client';
import { getAccessToken } from '@/lib/auth/storage';

export interface BusinessUnit {
  id: string;
  name: string;
  code: string | null;
  head_user_id: string | null;
}

export interface Department {
  id: string;
  business_unit_id: string;
  name: string;
  code: string | null;
  head_user_id: string | null;
}

export interface Team {
  id: string;
  department_id: string;
  name: string;
  code: string | null;
  head_user_id: string | null;
}

export interface RopaDashboardKPIs {
  total: number;
  published: number;
  draft: number;
  pending: number;
  high_risk: number;
  critical: number;
  without_dpia: number;
  without_owner: number;
  without_retention: number;
  without_purpose: number;
  without_vendor: number;
  cross_border: number;
  ai_discovered: number;
  compliance_percentage: number;
  banking_enabled?: boolean;
  without_channel?: number;
  without_data_source?: number;
  without_retention_link?: number;
  by_channel?: Record<string, number>;
}

export interface RopaBankingContext {
  channels: string[];
  identifier_types: string[];
  primary_identifier?: string | null;
  secondary_identifiers: string[];
  consent_journey_keys: string[];
}

export interface ActivityDataSource {
  id: string;
  activity_id: string;
  data_source_id: string;
  role: string;
  notes: string | null;
  data_source_name?: string | null;
}

export interface LinkedConsentNotice {
  notice_id: string;
  notice_name: string;
  version_id: string;
  version_status: string;
  purpose_names: string[];
}

export interface ActivityOwner {
  id: string;
  activity_id: string;
  user_id: string;
  owner_role: string;
  user_email: string | null;
  user_name: string | null;
}

export interface ActivityPurpose {
  id: string;
  activity_id: string;
  purpose_id: string;
  sort_order: number;
  purpose_name: string | null;
}

export interface ActivityDataCategory {
  id: string;
  activity_id: string;
  category_name: string;
  is_special: boolean;
  sensitivity: string;
}

export interface ActivityDataPrincipal {
  id: string;
  activity_id: string;
  category_name: string;
  description: string | null;
  includes_children: boolean;
}

export interface ActivityLawfulBasis {
  id: string;
  activity_id: string;
  basis_type: string;
  justification: string | null;
  dpdpa_section: string | null;
}

export interface ActivitySystem {
  id: string;
  activity_id: string;
  system_name: string;
  system_type: string;
  location: string | null;
  description: string | null;
  property_id?: string | null;
  channel?: string | null;
  property_name?: string | null;
}

export interface ActivityRecipient {
  id: string;
  activity_id: string;
  recipient_type: string;
  name: string;
  data_shared: string | null;
  data_processor_id: string | null;
}

export interface ActivityCrossBorderTransfer {
  id: string;
  activity_id: string;
  destination_country: string;
  destination_entity: string | null;
  adequacy_status: string;
  safeguard_mechanism: string | null;
  legal_basis: string | null;
}

export interface ActivityRetentionPolicy {
  id: string;
  activity_id: string;
  retention_period: string;
  trigger_event: string | null;
  legal_basis: string | null;
  auto_delete: boolean;
  retention_policy_id?: string | null;
  linked_policy_name?: string | null;
  effective_retention_period?: string | null;
  effective_trigger_event?: string | null;
  effective_legal_basis?: string | null;
}

export interface ActivitySecurityMeasure {
  id: string;
  activity_id: string;
  measure_type: string;
  description: string | null;
  status: string;
}

export interface ActivityDpiaLink {
  id: string;
  activity_id: string;
  dpia_id: string;
  link_type: string;
  dpia_title: string | null;
  dpia_status: string | null;
}

export interface ActivityApproval {
  id: string;
  activity_id: string;
  version_id: string | null;
  role_required: string;
  approver_id: string | null;
  status: string;
  comments: string | null;
  decided_at: string | null;
  created_at: string;
}

export interface ActivityVersion {
  id: string;
  activity_id: string;
  version_number: number;
  status: string;
  snapshot_json: Record<string, any>;
  changelog: string | null;
  created_by_id: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface ProcessingActivity {
  id: string;
  organization_id: string;
  activity_ref: string;
  title: string;
  description: string | null;
  status: string;
  risk_score: number;
  risk_level: string;
  business_unit_id: string;
  department_id: string | null;
  team_id: string | null;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
  business_unit_name: string | null;
  department_name: string | null;
  team_name: string | null;
  banking_context?: RopaBankingContext | null;
}

export interface ActivityEvent {
  id: string;
  activity_id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_name: string | null;
  details: Record<string, any> | null;
  previous_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  ip_address: string | null;
  chain_hash: string;
  created_at: string;
}

export interface ProcessingActivityDetail extends ProcessingActivity {
  versions: ActivityVersion[];
  owners: ActivityOwner[];
  purposes: ActivityPurpose[];
  data_categories: ActivityDataCategory[];
  data_principals: ActivityDataPrincipal[];
  lawful_bases: ActivityLawfulBasis[];
  systems: ActivitySystem[];
  recipients: ActivityRecipient[];
  cross_border_transfers: ActivityCrossBorderTransfer[];
  retention_policies: ActivityRetentionPolicy[];
  security_measures: ActivitySecurityMeasure[];
  dpia_links: ActivityDpiaLink[];
  data_sources: ActivityDataSource[];
  linked_consent_notices?: LinkedConsentNotice[];
  approvals: ActivityApproval[];
  events: ActivityEvent[];
}

export interface RopaBankingPresets {
  presets: Record<string, RopaBankingContext & { label?: string }>;
  identifier_types: Array<{ key: string; label: string; enabled?: boolean }>;
  journeys: Array<{ key: string; label: string; channel?: string }>;
}

export interface CreateDpiaFromActivityResult {
  dpia_id: string;
  dpia_ref: string;
  title: string;
  link_id: string;
}


export interface VersionDiff {
  version_a_number: number;
  version_b_number: number;
  diff_data: Record<string, any>;
}

// --- API Functions ---

export async function fetchBusinessUnits(orgId?: string): Promise<BusinessUnit[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<BusinessUnit[]>(`/ropa/business-units${qs}`);
}

export async function createBusinessUnit(
  body: { name: string; code?: string | null },
  orgId?: string
): Promise<BusinessUnit> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<BusinessUnit>(`/ropa/business-units${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchDepartments(orgId?: string): Promise<Department[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<Department[]>(`/ropa/departments${qs}`);
}

export async function createDepartment(
  body: { business_unit_id: string; name: string; code?: string | null },
  orgId?: string
): Promise<Department> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<Department>(`/ropa/departments${qs}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function fetchTeams(orgId?: string): Promise<Team[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<Team[]>(`/ropa/teams${qs}`);
}

export async function fetchRopaDashboard(orgId?: string): Promise<RopaDashboardKPIs> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<RopaDashboardKPIs>(`/ropa/dashboard${qs}`);
}

export async function fetchRopaActivities(filters: {
  search?: string;
  department_id?: string;
  owner_id?: string;
  status?: string;
  risk_level?: string;
  destination_country?: string;
  purpose_id?: string;
  vendor_id?: string;
  lawful_basis?: string;
  retention_period?: string;
  system_name?: string;
  orgId?: string;
} = {}): Promise<ProcessingActivity[]> {
  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.department_id) params.append('department_id', filters.department_id);
  if (filters.owner_id) params.append('owner_id', filters.owner_id);
  if (filters.status) params.append('status', filters.status);
  if (filters.risk_level) params.append('risk_level', filters.risk_level);
  if (filters.destination_country) params.append('destination_country', filters.destination_country);
  if (filters.purpose_id) params.append('purpose_id', filters.purpose_id);
  if (filters.vendor_id) params.append('vendor_id', filters.vendor_id);
  if (filters.lawful_basis) params.append('lawful_basis', filters.lawful_basis);
  if (filters.retention_period) params.append('retention_period', filters.retention_period);
  if (filters.system_name) params.append('system_name', filters.system_name);
  if (filters.orgId) params.append('org_id', filters.orgId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<ProcessingActivity[]>(`/ropa/activities${qs}`);
}

export async function fetchRopaActivityDetail(id: string, orgId?: string): Promise<ProcessingActivityDetail> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}${qs}`);
}

export async function createRopaActivity(payload: any, orgId?: string): Promise<ProcessingActivityDetail> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities${qs}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRopaActivity(id: string, payload: any, orgId?: string): Promise<ProcessingActivityDetail> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}${qs}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRopaActivity(id: string, orgId?: string): Promise<void> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<void>(`/ropa/activities/${id}${qs}`, {
    method: 'DELETE',
  });
}

export async function submitRopaForReview(id: string): Promise<ActivityApproval[]> {
  return apiFetch<ActivityApproval[]>(`/ropa/activities/${id}/submit`, {
    method: 'POST',
  });
}

export async function processRopaApprovalDecision(approvalId: string, payload: { status: string; comments?: string }): Promise<ActivityApproval> {
  return apiFetch<ActivityApproval>(`/ropa/approvals/${approvalId}/decision`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function publishRopaActivity(id: string): Promise<ProcessingActivityDetail> {
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}/publish`, {
    method: 'POST',
  });
}

export async function deprecateRopaActivity(id: string): Promise<ProcessingActivityDetail> {
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}/deprecate`, {
    method: 'POST',
  });
}

export async function archiveRopaActivity(id: string): Promise<ProcessingActivityDetail> {
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}/archive`, {
    method: 'POST',
  });
}

export async function restoreRopaActivity(id: string): Promise<ProcessingActivityDetail> {
  return apiFetch<ProcessingActivityDetail>(`/ropa/activities/${id}/restore`, {
    method: 'POST',
  });
}

export async function checkoutRopaVersion(id: string, changelog: string): Promise<ActivityVersion> {
  return apiFetch<ActivityVersion>(`/ropa/activities/${id}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ changelog }),
  });
}

export async function compareRopaVersions(versionAId: string, versionBId: string): Promise<VersionDiff> {
  return apiFetch<VersionDiff>(`/ropa/activities/versions/compare?version_a_id=${versionAId}&version_b_id=${versionBId}`);
}

export async function rollbackRopaVersion(id: string, versionId: string): Promise<ActivityVersion> {
  return apiFetch<ActivityVersion>(`/ropa/activities/${id}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ version_id: versionId }),
  });
}

export interface RopaDiscoverySuggestion {
  id: string;
  organization_id: string;
  source_type: string;
  source_name: string;
  description: string | null;
  suggested_title: string;
  suggested_description: string | null;
  suggested_data_categories: string[];
  suggested_lawful_basis: string | null;
  suggested_recipient: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function fetchRopaSuggestions(orgId?: string): Promise<RopaDiscoverySuggestion[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<RopaDiscoverySuggestion[]>(`/ropa/suggestions${qs}`);
}

export async function acceptRopaSuggestion(suggestionId: string): Promise<ProcessingActivityDetail> {
  return apiFetch<ProcessingActivityDetail>(`/ropa/suggestions/${suggestionId}/accept`, {
    method: 'POST',
  });
}

export async function dismissRopaSuggestion(suggestionId: string): Promise<RopaDiscoverySuggestion> {
  return apiFetch<RopaDiscoverySuggestion>(`/ropa/suggestions/${suggestionId}/dismiss`, {
    method: 'POST',
  });
}

export async function scanRopaSuggestions(orgId?: string): Promise<RopaDiscoverySuggestion[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<RopaDiscoverySuggestion[]>(`/ropa/suggestions/scan${qs}`, {
    method: 'POST',
  });
}

export async function fetchRopaBankingPresets(orgId?: string): Promise<RopaBankingPresets> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<RopaBankingPresets>(`/ropa/banking-presets${qs}`);
}

export async function createDpiaFromActivity(
  activityId: string,
  orgId?: string,
): Promise<CreateDpiaFromActivityResult> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<CreateDpiaFromActivityResult>(`/ropa/activities/${activityId}/create-dpia${qs}`, {
    method: 'POST',
  });
}

export async function exportRopaRegister(
  format: 'pdf' | 'xlsx' | 'json',
  orgId?: string,
  params?: { purpose_id?: string; channel?: string; business_unit_id?: string },
): Promise<Blob> {
  const q = new URLSearchParams({ format });
  if (orgId) q.set('org_id', orgId);
  if (params?.purpose_id) q.set('purpose_id', params.purpose_id);
  if (params?.channel) q.set('channel', params.channel);
  if (params?.business_unit_id) q.set('business_unit_id', params.business_unit_id);
  const token = getAccessToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${getApiBaseUrl()}/ropa/export?${q.toString()}`, { headers });
  if (!res.ok) {
    throw new ApiError(res.status, 'RoPA export failed');
  }
  return res.blob();
}

