import { apiFetch } from '@/lib/api/client';

export interface ConsentCampaignPurpose {
  id: string;
  name: string;
  description: string;
  legal_basis: string;
  is_required: boolean;
  default_consented: boolean;
}

export interface ConsentCampaignPage {
  already_responded: boolean;
  consent_decision: string;
  organization_name: string;
  organization_slug: string | null;
  masked_email: string | null;
  masked_phone: string | null;
  recipient_name: string;
  recipient_email?: string | null;
  recipient_phone?: string | null;
  notice: {
    title: string;
    description: string;
    dpo_name?: string;
    dpo_email?: string;
    retention_policy?: string;
    rights_exercise?: string;
    language?: string;
  };
  purposes: ConsentCampaignPurpose[];
  portal_url: string | null;
  notice_version_id: string | null;
}

async function publicFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(typeof err.detail === 'string' ? err.detail : 'Request failed');
  }
  return response.json() as Promise<T>;
}

export function fetchConsentCampaignPage(token: string, lang = 'en'): Promise<ConsentCampaignPage> {
  return publicFetch<ConsentCampaignPage>(`/public/v1/consent-campaign/${encodeURIComponent(token)}?lang=${lang}`);
}

export function submitConsentCampaignDecision(
  token: string,
  body: {
    decision_type: string;
    consented_purposes: Record<string, boolean>;
    language: string;
    otp_channel?: 'email' | 'sms';
    recipient_email?: string;
    recipient_phone?: string;
  },
): Promise<{ status: string; masked_email: string | null; masked_phone: string | null; session_id: string }> {
  return publicFetch(`/public/v1/consent-campaign/${encodeURIComponent(token)}/decision`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function verifyConsentCampaignOtp(
  token: string,
  otpCode: string,
): Promise<{
  status: string;
  receipt_id: string;
  consent_decision: string;
  consented_purposes: Record<string, boolean>;
  portal_url: string | null;
  organization_name: string;
}> {
  return publicFetch(`/public/v1/consent-campaign/${encodeURIComponent(token)}/otp/verify`, {
    method: 'POST',
    body: JSON.stringify({ otp_code: otpCode }),
  });
}

export function resendConsentCampaignOtp(
  token: string,
): Promise<{ status: string; masked_email: string | null }> {
  return publicFetch(`/public/v1/consent-campaign/${encodeURIComponent(token)}/otp/resend`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export interface RecipientContact {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  last_consent_at?: string | null;
  last_purposes?: Record<string, boolean> | null;
}

export interface RecipientPreview {
  total: number;
  preview: RecipientContact[];
  warnings: string[];
  upload_id?: string;
  status?: string;
}

export interface CampaignRecipientUpload {
  id: string;
  organization_id: string;
  original_filename: string;
  column_headers: string[];
  field_map: Record<string, string>;
  row_count: number;
  status: string;
}

export const emailCampaignApi = {
  searchRecipients(q?: string, segment = 'all', noticeId?: string): Promise<RecipientContact[]> {
    const params = new URLSearchParams({ segment });
    if (q) params.set('q', q);
    if (noticeId) params.set('notice_id', noticeId);
    return apiFetch<RecipientContact[]>(`/notice-delivery/recipients/search?${params}`);
  },

  async uploadRecipients(file: File): Promise<CampaignRecipientUpload> {
    const form = new FormData();
    form.append('file', file);
    return apiFetch<CampaignRecipientUpload>('/notice-delivery/recipients/upload', {
      method: 'POST',
      body: form,
    });
  },

  mapUpload(uploadId: string, fieldMap: Record<string, string>): Promise<CampaignRecipientUpload> {
    return apiFetch<CampaignRecipientUpload>(`/notice-delivery/recipients/upload/${uploadId}/mapping`, {
      method: 'PUT',
      body: JSON.stringify({ field_map: fieldMap }),
    });
  },

  previewUpload(uploadId: string): Promise<RecipientPreview> {
    return apiFetch<RecipientPreview>(`/notice-delivery/recipients/upload/${uploadId}/preview`);
  },

  previewDataAsset(assetId: string, fieldMap: Record<string, string>): Promise<RecipientPreview> {
    return apiFetch<RecipientPreview>('/notice-delivery/recipients/from-asset/preview', {
      method: 'POST',
      body: JSON.stringify({ asset_id: assetId, field_map: fieldMap }),
    });
  },
};
