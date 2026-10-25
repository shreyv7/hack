import { apiFetch } from '@/lib/api/client';
import type {
  ComplianceCheckResult,
  NoticeCreate,
  NoticeDetail,
  NoticeSummary,
  NoticeVersion,
  NoticeVersionContentUpdate,
  Purpose,
  PurposeCreate,
  PurposeDetail,
  PurposeUpdate,
  ConsentBanner,
  BannerCreate,
  ConsentActivity,
  NoticeActivity,
  PurposeActivity,
} from '@/types/consent';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchPurposes(orgId?: string, includeArchived = false): Promise<Purpose[]> {
  const q = includeArchived ? '?include_archived=true' : '';
  return apiFetch<Purpose[]>(withOrgQuery(`/consent/purposes${q}`, orgId));
}

export function fetchPurpose(id: string, orgId?: string): Promise<PurposeDetail> {
  return apiFetch<PurposeDetail>(withOrgQuery(`/consent/purposes/${id}`, orgId));
}

export function createPurpose(body: PurposeCreate, orgId?: string): Promise<Purpose> {
  return apiFetch<Purpose>(withOrgQuery('/consent/purposes', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updatePurpose(id: string, body: PurposeUpdate, orgId?: string): Promise<Purpose> {
  return apiFetch<Purpose>(withOrgQuery(`/consent/purposes/${id}`, orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function archivePurpose(id: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/consent/purposes/${id}`, orgId), { method: 'DELETE' });
}

export function fetchNotices(orgId?: string, includeArchived = false): Promise<NoticeSummary[]> {
  const q = includeArchived ? '?include_archived=true' : '';
  return apiFetch<NoticeSummary[]>(withOrgQuery(`/consent/notices${q}`, orgId));
}

export function fetchNotice(id: string, orgId?: string): Promise<NoticeDetail> {
  return apiFetch<NoticeDetail>(withOrgQuery(`/consent/notices/${id}`, orgId));
}

export function createNotice(body: NoticeCreate, orgId?: string): Promise<NoticeDetail> {
  return apiFetch<NoticeDetail>(withOrgQuery('/consent/notices', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchNoticeVersion(
  noticeId: string,
  versionId: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}`, orgId)
  );
}

export function updateNoticeVersion(
  noticeId: string,
  versionId: string,
  body: NoticeVersionContentUpdate,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}`, orgId),
    { method: 'PATCH', body: JSON.stringify(body) }
  );
}

export function setVersionPurposes(
  noticeId: string,
  versionId: string,
  purposeIds: string[],
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/purposes`, orgId),
    { method: 'PUT', body: JSON.stringify({ purpose_ids: purposeIds }) }
  );
}

export function publishNoticeVersion(
  noticeId: string,
  versionId: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/publish`, orgId),
    { method: 'POST' }
  );
}

export function submitNoticeForReview(
  noticeId: string,
  versionId: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/submit-review`, orgId),
    { method: 'POST' }
  );
}

export function fetchNoticeApprovals(orgId?: string): Promise<import('@/types/consent').NoticeApprovalQueueItem[]> {
  return apiFetch(withOrgQuery('/consent/notices/approvals', orgId));
}

export function approveNoticeLegal(
  noticeId: string,
  versionId: string,
  comment?: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/approve-legal`, orgId),
    { method: 'POST', body: JSON.stringify({ comment: comment ?? null }) }
  );
}

export function approveNoticeDpo(
  noticeId: string,
  versionId: string,
  comment?: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/approve-dpo`, orgId),
    { method: 'POST', body: JSON.stringify({ comment: comment ?? null }) }
  );
}

export function rejectNoticeReview(
  noticeId: string,
  versionId: string,
  comment?: string,
  orgId?: string
): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/reject-review`, orgId),
    { method: 'POST', body: JSON.stringify({ comment: comment ?? null }) }
  );
}

export interface BankingBannerPresets {
  presets: Record<
    string,
    {
      channel: string;
      journey_key: string;
      journey_label: string;
      display_style: string;
      position: string;
      cta_accept: string;
      cta_reject: string;
      cta_customize: string;
      cta_withdraw: string;
      show_withdraw_action: boolean;
    }
  >;
}

export function fetchBankingBannerPresets(orgId?: string): Promise<BankingBannerPresets> {
  return apiFetch<BankingBannerPresets>(withOrgQuery('/consent/banking/banner-presets', orgId));
}

export interface BannerAbSummary {
  banner_id: string;
  ab_test_enabled: boolean;
  ab_test_started_at: string | null;
  ab_test_duration_days: number;
  assigned_variant_a: number;
  assigned_variant_b: number;
  concluded_sessions: number;
  conversions: number;
}

export function fetchBannerAbSummary(bannerId: string, orgId?: string): Promise<BannerAbSummary> {
  return apiFetch<BannerAbSummary>(withOrgQuery(`/consent/banners/${bannerId}/ab-summary`, orgId));
}

export function runComplianceCheck(
  noticeId: string,
  versionId: string,
  autoFix: boolean,
  orgId?: string
): Promise<ComplianceCheckResult> {
  const q = autoFix ? '?auto_fix=true' : '';
  return apiFetch<ComplianceCheckResult>(
    withOrgQuery(`/consent/notices/${noticeId}/versions/${versionId}/compliance-check${q}`, orgId),
    { method: 'POST' }
  );
}

export function createDraftFromLive(noticeId: string, orgId?: string): Promise<NoticeVersion> {
  return apiFetch<NoticeVersion>(
    withOrgQuery(`/consent/notices/${noticeId}/draft-from-live`, orgId),
    { method: 'POST' }
  );
}

export function archiveNotice(noticeId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/consent/notices/${noticeId}/archive`, orgId), {
    method: 'POST',
  });
}

export function fetchBanners(orgId?: string, includeArchived = false): Promise<ConsentBanner[]> {
  const q = includeArchived ? '?include_archived=true' : '';
  return apiFetch<ConsentBanner[]>(withOrgQuery(`/consent/banners${q}`, orgId));
}

export function archiveBanner(bannerId: string, orgId?: string): Promise<void> {
  return apiFetch<void>(withOrgQuery(`/consent/banners/${bannerId}/archive`, orgId), {
    method: 'POST',
  });
}

export function unarchiveBanner(bannerId: string, orgId?: string): Promise<ConsentBanner> {
  return apiFetch<ConsentBanner>(withOrgQuery(`/consent/banners/${bannerId}/unarchive`, orgId), {
    method: 'POST',
  });
}

export function createBanner(body: BannerCreate, orgId?: string): Promise<ConsentBanner> {
  return apiFetch<ConsentBanner>(withOrgQuery('/consent/banners', orgId), {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function fetchBanner(bannerId: string, orgId?: string): Promise<ConsentBanner> {
  return apiFetch<ConsentBanner>(withOrgQuery(`/consent/banners/${bannerId}`, orgId));
}

export function updateBanner(bannerId: string, body: BannerCreate, orgId?: string): Promise<ConsentBanner> {
  return apiFetch<ConsentBanner>(withOrgQuery(`/consent/banners/${bannerId}`, orgId), {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export interface WebhookTestResponse {
  success: boolean;
  status_code: number | null;
  latency_ms: number;
  message: string;
  payload: Record<string, unknown>;
  delivery_log_id?: string | null;
}

export function testConsentWebhook(
  url: string,
  orgId?: string,
  options?: { propertyId?: string; bannerId?: string; eventType?: string },
): Promise<WebhookTestResponse> {
  const params = new URLSearchParams();
  if (options?.propertyId) params.set('property_id', options.propertyId);
  if (options?.bannerId) params.set('banner_id', options.bannerId);
  const query = params.toString();
  const path = `/consent/webhook/test${query ? `?${query}` : ''}`;
  return apiFetch<WebhookTestResponse>(withOrgQuery(path, orgId), {
    method: 'POST',
    body: JSON.stringify({
      url,
      event_type: options?.eventType,
    }),
  });
}

export function unarchiveNotice(noticeId: string, orgId?: string): Promise<NoticeDetail> {
  return apiFetch<NoticeDetail>(withOrgQuery(`/consent/notices/${noticeId}/unarchive`, orgId), {
    method: 'POST',
  });
}

export function unarchivePurpose(purposeId: string, orgId?: string): Promise<Purpose> {
  return apiFetch<Purpose>(withOrgQuery(`/consent/purposes/${purposeId}/unarchive`, orgId), {
    method: 'POST',
  });
}

export function fetchActivities(orgId?: string): Promise<ConsentActivity[]> {
  return apiFetch<ConsentActivity[]>(withOrgQuery('/consent/activities', orgId));
}

export function fetchNoticeActivities(orgId?: string): Promise<NoticeActivity[]> {
  return apiFetch<NoticeActivity[]>(withOrgQuery('/consent/notices/activities', orgId));
}

export function fetchPurposeActivities(orgId?: string): Promise<PurposeActivity[]> {
  return apiFetch<PurposeActivity[]>(withOrgQuery('/consent/purposes/activities', orgId));
}

export function translateText(
  text: string,
  targetLang: string,
  orgId?: string
): Promise<{ translatedText: string }> {
  return apiFetch<{ translatedText: string }>(withOrgQuery('/consent/translate', orgId), {
    method: 'POST',
    body: JSON.stringify({ text, target_lang: targetLang }),
  });
}


export interface ConsentReceiptDetail {
  id: string;
  property_id: string;
  property_domain: string | null;
  organization_id: string;
  session_id: string;
  consented_purposes: Record<string, boolean>;
  language: string;
  principal_email: string | null;
  principal_phone: string | null;
  portal_sms_sent_at?: string | null;
  portal_sms_status?: string | null;
  capture_channel?: string | null;
  journey_key?: string | null;
  bank_customer_ref?: string | null;
  principal_id?: string | null;
  identifier_snapshot?: Array<{ type: string; fingerprint: string }> | null;
  proof_vault_record_id?: string | null;
  proof_seal_status?: string | null;
  assisted_capture_metadata?: Record<string, string> | null;
  created_at: string;
  ip_hash: string;
  user_agent: string | null;
}

export interface ConsentReceiptPaginatedRead {
  total: number;
  page: number;
  limit: number;
  items: ConsentReceiptDetail[];
}

export function fetchConsentReceipts(
  orgId?: string,
  params: {
    property_id?: string;
    page?: number;
    limit?: number;
    search?: string;
  } = {}
): Promise<ConsentReceiptPaginatedRead> {
  const parts: string[] = [];
  if (params.property_id) parts.push(`property_id=${encodeURIComponent(params.property_id)}`);
  if (params.page) parts.push(`page=${params.page}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  
  const query = parts.length > 0 ? `?${parts.join('&')}` : '';
  return apiFetch<ConsentReceiptPaginatedRead>(withOrgQuery(`/consent/receipts${query}`, orgId));
}

export async function downloadConsentReceiptsXlsx(
  orgId?: string,
  params: {
    property_id?: string;
    search?: string;
  } = {}
): Promise<void> {
  const parts: string[] = [];
  if (params.property_id) parts.push(`property_id=${encodeURIComponent(params.property_id)}`);
  if (params.search) parts.push(`search=${encodeURIComponent(params.search)}`);
  if (orgId) parts.push(`org_id=${encodeURIComponent(orgId)}`);
  
  const query = parts.length > 0 ? `?${parts.join('&')}` : '';
  
  // Dynamically import token helpers if needed
  const { getApiBaseUrl } = await import('@/lib/api/client');
  const { getAccessToken } = await import('@/lib/auth/storage');
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}/consent/receipts/export/xlsx${query}`;
  
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error('Export failed');
  }
  
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.setAttribute('download', 'consent_receipts.xlsx');
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
}



