import { apiFetch, getApiBaseUrl } from './client';
import { getAccessToken } from '@/lib/auth/storage';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export interface DPIAStep {
  id: string;
  dpia_id: string;
  step_key: string;
  step_order: number;
  completion_percentage: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DPIAStepAnswer {
  id: string;
  version_id: string;
  step_key: string;
  question_key: string;
  answer_text: string | null;
  answer_json: any | null;
  compliance_status: string;
}

export interface DPIAControlLibrary {
  id: string;
  control_code: string;
  title: string;
  description: string | null;
  control_type: string;
  mitigation_weight: number;
  standards_mapping: Record<string, string> | null;
}

export interface DPIAControl {
  id: string;
  risk_id: string;
  control_library_id: string;
  status: string;
  owner_user_id: string | null;
  custom_instructions: string | null;
  verified_at: string | null;
  verified_by: string | null;
  library_control?: DPIAControlLibrary | null;
}

export interface DPIATask {
  id: string;
  risk_id: string;
  control_id: string | null;
  title: string;
  assignee_user_id: string;
  due_date: string | null;
  status: string;
}

export interface DPIARisk {
  id: string;
  version_id: string;
  title: string;
  description: string | null;
  category: string | null;
  likelihood: number;
  impact: number;
  sensitivity_factor: number;
  inherent_score: number;
  residual_likelihood: number | null;
  residual_impact: number | null;
  residual_score: number | null;
  status: string;
  is_auto_escalated: boolean;
  controls: DPIAControl[];
  tasks: DPIATask[];
}

export interface DPIAApproval {
  id: string;
  version_id: string;
  workflow_node_id: string | null;
  approver_user_id: string | null;
  role_required: string;
  status: string;
  comments: string | null;
  decided_at: string | null;
}

export interface DPIAComment {
  id: string;
  dpia_id: string;
  parent_comment_id: string | null;
  user_id: string;
  step_key: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  replies?: DPIAComment[];
}

export interface DPIAEvent {
  id: string;
  dpia_id: string;
  event_type: string;
  actor_user_id: string | null;
  details: Record<string, any> | null;
  previous_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  ip_address: string | null;
  user_agent: string | null;
  chain_hash: string;
  created_at: string;
}

export interface DPIAVersionDetail {
  id: string;
  dpia_id: string;
  version_number: number;
  status: string;
  changelog: string | null;
  created_by_user_id: string | null;
  approved_at: string | null;
  created_at: string;
  step_answers: DPIAStepAnswer[];
  risks: DPIARisk[];
  approvals: DPIAApproval[];
}

export interface DPIARecord {
  id: string;
  organization_id: string;
  dpia_ref: string;
  title: string;
  description: string | null;
  current_version_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DPIADetail extends DPIARecord {
  steps: DPIAStep[];
  versions: DPIAVersionDetail[];
  current_version: DPIAVersionDetail | null;
}

export interface DPIASummaryStats {
  total_dpias: number;
  high_risk: number;
  critical_risk: number;
  pending_reviews: number;
  pending_approvals: number;
  overdue_tasks: number;
  compliance_score: number;
  risk_level_distribution: Record<string, number>;
  department_distribution: Record<string, number>;
  recent_events: DPIAEvent[];
}

export interface DPIATemplate {
  id: string;
  key: string;
  name: string;
  schema_definition: any;
  is_active: boolean;
}

export interface DPIAAsset {
  id: string;
  dpia_id: string;
  asset_type: string;
  asset_id: string;
}

export async function fetchDPIASummary(orgId?: string): Promise<DPIASummaryStats> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<DPIASummaryStats>(`/dpia/summary${qs}`);
}

export async function fetchDPIAs(query?: string, status?: string, orgId?: string): Promise<DPIARecord[]> {
  const params = new URLSearchParams();
  if (query) params.append('query', query);
  if (status) params.append('status', status);
  if (orgId) params.append('org_id', orgId);

  const qs = params.toString() ? `?${params.toString()}` : '';
  return apiFetch<DPIARecord[]>(`/dpia${qs}`);
}

export async function fetchDPIATemplates(orgId?: string): Promise<DPIATemplate[]> {
  return apiFetch<DPIATemplate[]>(withOrgQuery('/dpia/templates', orgId));
}

export async function fetchControlLibrary(orgId?: string): Promise<DPIAControlLibrary[]> {
  const qs = orgId ? `?org_id=${orgId}` : '';
  return apiFetch<DPIAControlLibrary[]>(`/dpia/control-library${qs}`);
}

export async function fetchDPIADetail(id: string): Promise<DPIADetail> {
  return apiFetch<DPIADetail>(`/dpia/${id}`);
}

export async function createDPIA(
  payload: { title: string; description?: string; template_key?: string },
  orgId?: string,
): Promise<DPIARecord> {
  return apiFetch<DPIARecord>(withOrgQuery('/dpia', orgId), {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDPIA(id: string, payload: { title?: string; description?: string; status?: string }): Promise<DPIARecord> {
  return apiFetch<DPIARecord>(`/dpia/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function archiveDPIA(id: string): Promise<DPIARecord> {
  return apiFetch<DPIARecord>(`/dpia/${id}`, {
    method: 'DELETE',
  });
}

export async function checkoutNewVersion(id: string, changelog: string): Promise<DPIAVersionDetail> {
  return apiFetch<DPIAVersionDetail>(`/dpia/${id}/checkout?changelog=${encodeURIComponent(changelog)}`, {
    method: 'POST',
  });
}

export async function saveStepAnswer(
  id: string,
  payload: { step_key: string; question_key: string; answer_text?: string; answer_json?: any }
): Promise<DPIAStepAnswer> {
  return apiFetch<DPIAStepAnswer>(`/dpia/${id}/step-answer`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDPIARisks(id: string): Promise<DPIARisk[]> {
  return apiFetch<DPIARisk[]>(`/dpia/${id}/risks`);
}

export async function addDPIARisk(
  id: string,
  payload: { title: string; description?: string; category?: string; likelihood: number; impact: number }
): Promise<DPIARisk> {
  return apiFetch<DPIARisk>(`/dpia/${id}/risks`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateDPIARisk(
  id: string,
  rid: string,
  payload: { title?: string; description?: string; category?: string; likelihood?: number; impact?: number; status?: string }
): Promise<DPIARisk> {
  return apiFetch<DPIARisk>(`/dpia/${id}/risks/${rid}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteDPIARisk(id: string, rid: string): Promise<void> {
  return apiFetch<void>(`/dpia/${id}/risks/${rid}`, {
    method: 'DELETE',
  });
}

export async function addMitigationControl(
  id: string,
  rid: string,
  payload: { control_library_id: string; owner_user_id?: string; custom_instructions?: string }
): Promise<DPIAControl> {
  return apiFetch<DPIAControl>(`/dpia/${id}/risks/${rid}/controls`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateControlStatus(
  id: string,
  cid: string,
  payload: { status?: string; owner_user_id?: string; custom_instructions?: string }
): Promise<DPIAControl> {
  return apiFetch<DPIAControl>(`/dpia/${id}/controls/${cid}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function verifyControl(id: string, cid: string, isVerified: boolean): Promise<DPIAControl> {
  return apiFetch<DPIAControl>(`/dpia/${id}/controls/${cid}/verify?is_verified=${isVerified}`, {
    method: 'POST',
  });
}

export async function submitForApproval(id: string): Promise<DPIAApproval[]> {
  return apiFetch<DPIAApproval[]>(`/dpia/${id}/submit`, {
    method: 'POST',
  });
}

export async function processApprovalDecision(aid: string, payload: { status: string; comments?: string }): Promise<DPIAApproval> {
  return apiFetch<DPIAApproval>(`/dpia/approvals/${aid}/decision`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchDPIAApprovals(id: string): Promise<DPIAApproval[]> {
  return apiFetch<DPIAApproval[]>(`/dpia/${id}/approvals`);
}

export async function fetchDPIAComments(id: string): Promise<DPIAComment[]> {
  return apiFetch<DPIAComment[]>(`/dpia/${id}/comments`);
}

export async function addDPIAComment(id: string, payload: { parent_comment_id?: string; step_key?: string; content: string }): Promise<DPIAComment> {
  return apiFetch<DPIAComment>(`/dpia/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchDPIAEvents(id: string): Promise<DPIAEvent[]> {
  return apiFetch<DPIAEvent[]>(`/dpia/${id}/events`);
}

export async function fetchDPIAAssets(id: string): Promise<DPIAAsset[]> {
  return apiFetch<DPIAAsset[]>(`/dpia/${id}/assets`);
}

export async function linkDPIAAsset(id: string, payload: { asset_type: string; asset_id: string }): Promise<DPIAAsset> {
  return apiFetch<DPIAAsset>(`/dpia/${id}/assets`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function unlinkDPIAAsset(id: string, assetId: string): Promise<void> {
  return apiFetch<void>(`/dpia/${id}/assets/${assetId}`, {
    method: 'DELETE',
  });
}

export async function evaluateRules(id: string): Promise<{ status: string; rules_triggered: number }> {
  return apiFetch<{ status: string; rules_triggered: number }>(`/dpia/${id}/evaluate-rules`, {
    method: 'POST',
  });
}

export async function evaluateCompliance(id: string): Promise<{ status: string; compliance_score: number }> {
  return apiFetch<{ status: string; compliance_score: number }>(`/dpia/${id}/evaluate-compliance`, {
    method: 'POST',
  });
}

export async function analyzeDpiaWithAI(id: string): Promise<{ status: string; analysis: string }> {
  return apiFetch<{ status: string; analysis: string }>(`/dpia/${id}/ai/analyze`, {
    method: 'POST',
  });
}

export async function fetchDpiaAiRecommendations(id: string): Promise<{ status: string; recommendations: string[] }> {
  return apiFetch<{ status: string; recommendations: string[] }>(`/dpia/${id}/ai/recommendations`);
}

export async function fetchDpiaScannerResults(id: string): Promise<{
  status: string;
  scanner_results: {
    discovered_fields: { field: string; category: string; status: string }[];
    existing_fields: { field: string; category: string; status: string }[];
  }
}> {
  return apiFetch<any>(`/dpia/${id}/scanner/results`);
}

export async function exportDpiaPdf(id: string): Promise<Blob> {
  const token = getAccessToken();
  const headers: HeadersInit = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${getApiBaseUrl()}/dpia/${id}/export-pdf`, {
    method: 'POST',
    headers,
  });

  if (!res.ok) {
    throw new Error('Failed to generate PDF');
  }
  return res.blob();
}
