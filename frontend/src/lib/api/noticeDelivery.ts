import { apiFetch } from '@/lib/api/client';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export interface NoticeCampaign {
  id: string;
  organization_id: string;
  name: string;
  notice_id: string;
  notice_version_id: string | null;
  status: 'draft' | 'legal_review' | 'dpo_approval' | 'scheduled' | 'running' | 'paused' | 'completed' | 'archived';
  delivery_strategy: 'email_only' | 'sms_only' | 'whatsapp_only' | 'physical_only' | 'parallel' | 'fallback' | 'smart';
  fallback_chain: string[];
  recipient_segment: string;
  schedule_type: 'immediate' | 'scheduled' | 'event_triggered';
  schedule_config: Record<string, any>;
  created_by_user_id: string | null;
  approved_by_dpo_id: string | null;
  approved_at: string | null;
  campaign_purpose?: 'notice_delivery' | 'consent_capture';
  recipient_source?: string | null;
  property_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryAttempt {
  id: string;
  campaign_delivery_id: string;
  channel: string;
  provider_id: string | null;
  status: string;
  attempt_number: number;
  sent_at: string;
  response_payload: Record<string, any>;
  error_message: string | null;
  created_at: string;
}

export interface CampaignDelivery {
  id: string;
  campaign_id: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string | null;
  recipient_phone: string | null;
  recipient_address: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'acknowledged' | 'failed' | 'retrying';
  current_channel: string;
  attempts_count: number;
  last_attempt_at: string | null;
  evidence_hash: string | null;
  proof_vault_ref: string | null;
  consent_decision?: 'pending' | 'accepted' | 'rejected' | 'customized' | 'expired';
  consent_receipt_id?: string | null;
  created_at: string;
  updated_at: string;
  attempts?: DeliveryAttempt[];
}

export interface NoticeDeliveryProvider {
  id: string;
  organization_id: string;
  channel: string;
  provider_name: string;
  is_active: boolean;
  is_configured: boolean;
  config: Record<string, string>;
  created_at: string;
  updated_at: string;
}

export interface DpNotificationAutoConfig {
  configured_channels: string[];
  providers_by_channel: Record<string, string>;
  default_dp_channels: string[];
  default_contact_email: string | null;
  dispatch_ready: boolean;
}

export interface ConsentPortalEmailConfig {
  enabled: boolean;
  email_field_label: string;
  email_provider_ready: boolean;
  portal_url: string | null;
}

export interface ConsentPortalEmailConfigUpdate {
  enabled?: boolean;
  email_field_label?: string;
}

export interface CampaignOverviewStats {
  notice_reach_percent: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_acknowledged: number;
  total_failed: number;
  total_cost: number;
  compliance_score: number;
  sla_compliance: string;
  channel_costs?: Record<string, number>;
}

export interface SmartAudienceDiff {
  already_informed: number;
  need_update: number;
  already_acknowledged: number;
  withdrawn_users: number;
  cannot_contact: number;
}

export interface NoticeCampaignActivity {
  id: string;
  campaign_id: string;
  action: string;
  actor_user_id: string | null;
  actor_name: string;
  details: string | null;
  created_at: string;
}

export const noticeDeliveryApi = {
  fetchCampaigns(): Promise<NoticeCampaign[]> {
    return apiFetch<NoticeCampaign[]>('/notice-delivery/campaigns');
  },

  createCampaign(body: Partial<NoticeCampaign>): Promise<NoticeCampaign> {
    return apiFetch<NoticeCampaign>('/notice-delivery/campaigns', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  transitionCampaign(campaignId: string, action: string): Promise<NoticeCampaign> {
    return apiFetch<NoticeCampaign>(`/notice-delivery/campaigns/${campaignId}/action?action=${action}`, {
      method: 'POST',
    });
  },

  fetchCampaignDeliveries(campaignId: string): Promise<CampaignDelivery[]> {
    return apiFetch<CampaignDelivery[]>(`/notice-delivery/campaigns/${campaignId}/deliveries`);
  },

  retryCampaignDelivery(campaignId: string, deliveryId: string): Promise<{ status: string }> {
    return apiFetch<{ status: string }>(`/notice-delivery/campaigns/${campaignId}/retry-delivery/${deliveryId}`, {
      method: 'POST',
    });
  },

  fetchCampaignActivities(campaignId: string): Promise<NoticeCampaignActivity[]> {
    return apiFetch<NoticeCampaignActivity[]>(`/notice-delivery/campaigns/${campaignId}/activities`);
  },

  fetchProviders(orgId?: string): Promise<NoticeDeliveryProvider[]> {
    return apiFetch<NoticeDeliveryProvider[]>(withOrgQuery('/notice-delivery/providers', orgId));
  },

  fetchDpNotificationConfig(orgId?: string): Promise<DpNotificationAutoConfig> {
    return apiFetch<DpNotificationAutoConfig>(
      withOrgQuery('/notice-delivery/providers/dp-notification-config', orgId),
    );
  },

  fetchConsentPortalEmailConfig(orgId?: string): Promise<ConsentPortalEmailConfig> {
    return apiFetch<ConsentPortalEmailConfig>(
      withOrgQuery('/notice-delivery/providers/consent-portal-email-config', orgId),
    );
  },

  updateConsentPortalEmailConfig(
    body: ConsentPortalEmailConfigUpdate,
    orgId?: string,
  ): Promise<ConsentPortalEmailConfig> {
    return apiFetch<ConsentPortalEmailConfig>(
      withOrgQuery('/notice-delivery/providers/consent-portal-email-config', orgId),
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
  },

  createProvider(body: any, orgId?: string): Promise<NoticeDeliveryProvider> {
    return apiFetch<NoticeDeliveryProvider>(withOrgQuery('/notice-delivery/providers', orgId), {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  updateProvider(providerId: string, body: any): Promise<NoticeDeliveryProvider> {
    return apiFetch<NoticeDeliveryProvider>(`/notice-delivery/providers/${providerId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  testProvider(providerId: string): Promise<{ success: boolean; message: string; response?: any }> {
    return apiFetch<{ success: boolean; message: string; response?: any }>(`/notice-delivery/providers/${providerId}/test`);
  },

  fetchNoticeDeliveryAnalytics(): Promise<CampaignOverviewStats> {
    return apiFetch<CampaignOverviewStats>('/notice-delivery/analytics');
  },

  fetchNoticeAudienceDiff(noticeId: string, segment: string = 'all'): Promise<SmartAudienceDiff> {
    return apiFetch<SmartAudienceDiff>(`/notice-delivery/notice-audience-diff/${noticeId}?segment=${segment}`);
  },

  fetchNoticeSegmentCounts(noticeId?: string): Promise<Record<string, number>> {
    const url = noticeId ? `/notice-delivery/segment-counts?notice_id=${noticeId}` : '/notice-delivery/segment-counts';
    return apiFetch<Record<string, number>>(url);
  },
};
