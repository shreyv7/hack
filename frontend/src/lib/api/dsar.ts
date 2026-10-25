import { apiFetch } from '@/lib/api/client';
import type {
  DataRightType,
  DataRightsRequest,
  DataRightsRequestStatus,
  DsarActivityAction,
  DsarActivityLog,
  DsarDashboard,
  PortalBranding,
  PortalFormSchema,
  PortalRequestCreate,
  PortalRequestCreated,
  OtpVerifyResponse,
  StatusCheckResponse,
} from '@/types/dsar';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchPortalBranding(orgSlug: string): Promise<PortalBranding> {
  return apiFetch<PortalBranding>(`/dsar/portal/${encodeURIComponent(orgSlug)}/branding`, {
    auth: false,
  });
}

export function fetchPortalForm(orgSlug: string, rightType: DataRightType): Promise<PortalFormSchema> {
  return apiFetch<PortalFormSchema>(
    `/dsar/portal/${encodeURIComponent(orgSlug)}/forms/${encodeURIComponent(rightType)}`,
    { auth: false }
  );
}

export function updatePortalForm(
  rightType: DataRightType,
  body: Pick<PortalFormSchema, 'help_text' | 'fields'>
): Promise<PortalFormSchema> {
  return apiFetch<PortalFormSchema>(`/dsar/portal-forms/${encodeURIComponent(rightType)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export function submitPortalRequest(
  orgSlug: string,
  body: PortalRequestCreate
): Promise<PortalRequestCreated> {
  return apiFetch<PortalRequestCreated>(
    `/dsar/portal/${encodeURIComponent(orgSlug)}/requests`,
    { method: 'POST', body: JSON.stringify(body), auth: false }
  );
}

export function verifyPortalOtp(
  orgSlug: string,
  trackingId: string,
  otpCode: string,
  contact: { email?: string; phone?: string }
): Promise<OtpVerifyResponse> {
  return apiFetch<OtpVerifyResponse>(
    `/dsar/portal/${encodeURIComponent(orgSlug)}/requests/${encodeURIComponent(trackingId)}/verify-otp`,
    {
      method: 'POST',
      body: JSON.stringify({
        email: contact.email || null,
        phone: contact.phone || null,
        otp_code: otpCode,
      }),
      auth: false,
    }
  );
}

export function resendPortalOtp(
  orgSlug: string,
  trackingId: string,
  contact: { email?: string; phone?: string }
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    `/dsar/portal/${encodeURIComponent(orgSlug)}/requests/${encodeURIComponent(trackingId)}/resend-otp`,
    { method: 'POST', body: JSON.stringify({ email: contact.email || null, phone: contact.phone || null }), auth: false }
  );
}

export function checkPortalStatus(
  orgSlug: string,
  trackingId: string,
  contact: { email?: string; phone?: string }
): Promise<StatusCheckResponse> {
  return apiFetch<StatusCheckResponse>(
    `/dsar/portal/${encodeURIComponent(orgSlug)}/requests/${encodeURIComponent(trackingId)}/status-check`,
    {
      method: 'POST',
      body: JSON.stringify({ email: contact.email || null, phone: contact.phone || null }),
      auth: false,
    }
  );
}

export function fetchDsarRequest(requestId: string, orgId?: string): Promise<DataRightsRequest> {
  return apiFetch<DataRightsRequest>(withOrgQuery(`/dsar/requests/${requestId}`, orgId));
}

export function fetchDsarDashboard(
  orgId?: string,
  filters?: { status?: DataRightsRequestStatus; right_type?: DataRightType }
): Promise<DsarDashboard> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.right_type) params.set('right_type', filters.right_type);
  const qs = params.toString();
  const path = withOrgQuery(`/dsar/dashboard${qs ? `?${qs}` : ''}`, orgId);
  return apiFetch<DsarDashboard>(path);
}

export function updateDsarRequest(
  requestId: string,
  body: {
    status?: DataRightsRequestStatus;
    assigned_to_user_id?: string | null;
    acknowledge_grievance?: boolean;
    requires_legal_signoff?: boolean;
  },
  orgId?: string
): Promise<DataRightsRequest> {
  return apiFetch<DataRightsRequest>(
    withOrgQuery(`/dsar/requests/${requestId}`, orgId),
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

export function batchUpdateDsarRequests(
  body: {
    request_ids: string[];
    assigned_to_user_id?: string | null;
    status?: DataRightsRequestStatus;
    advance_status?: boolean;
  },
  orgId?: string
): Promise<{ updated: number; skipped: number }> {
  return apiFetch(withOrgQuery('/dsar/requests/batch-update', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function legalSignoffDsarRequest(
  requestId: string,
  orgId?: string
): Promise<DataRightsRequest> {
  return apiFetch<DataRightsRequest>(
    withOrgQuery(`/dsar/requests/${requestId}/legal-signoff`, orgId),
    { method: 'POST' }
  );
}

export function resolveDsarRequest(
  requestId: string,
  closureNotes?: string,
  orgId?: string
): Promise<DataRightsRequest> {
  return apiFetch<DataRightsRequest>(
    withOrgQuery(`/dsar/requests/${requestId}/resolve`, orgId),
    { method: 'POST', body: JSON.stringify({ closure_notes: closureNotes ?? null }) }
  );
}

export function addDsarComment(
  requestId: string,
  message: string,
  orgId?: string
): Promise<DataRightsRequest> {
  return apiFetch<DataRightsRequest>(
    withOrgQuery(`/dsar/requests/${requestId}/comments`, orgId),
    { method: 'POST', body: JSON.stringify({ message }) }
  );
}

export function runSlaEngineOnce(): Promise<{ processed: number; reminders_sent: number; breaches_marked: number }> {
  return apiFetch('/dsar/admin/sla/run-once', { method: 'POST' });
}

export function fetchDsarActivityLog(
  orgId?: string,
  filters?: {
    tracking_id?: string;
    action?: DsarActivityAction;
    right_type?: DataRightType;
    actor?: string;
    limit?: number;
    offset?: number;
  }
): Promise<DsarActivityLog> {
  const params = new URLSearchParams();
  if (filters?.tracking_id) params.set('tracking_id', filters.tracking_id);
  if (filters?.action) params.set('action', filters.action);
  if (filters?.right_type) params.set('right_type', filters.right_type);
  if (filters?.actor) params.set('actor', filters.actor);
  if (filters?.limit) params.set('limit', String(filters.limit));
  if (filters?.offset) params.set('offset', String(filters.offset));
  const qs = params.toString();
  const path = withOrgQuery(`/dsar/activity-log${qs ? `?${qs}` : ''}`, orgId);
  return apiFetch<DsarActivityLog>(path);
}
