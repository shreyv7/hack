import { apiFetch } from './client';
import type {
  BannerAssociation,
  Property,
  PropertyCreate,
  PropertyDetail,
  PropertyUpdate,
  PropertyWithKey,
  SnippetOutput,
  IntegrationsOverviewStats,
  RecentActivityResponse,
  ConsentSearchResponse,
  PageCoverageScan,
  IntegrationEvent,
  PropertyWebhookConfig,
  PropertyWebhookConfigUpdate,
  DataRightsWebhookConfig,
  WebhookDeliveryLog,
  PropertyDeleteImpact,
} from '@/types/integrations';

function resolveOrgId(orgId?: string): string | undefined {
  return orgId || undefined;
}

function withOrgQuery(path: string, orgId?: string): string {
  const resolved = resolveOrgId(orgId);
  if (!resolved) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(resolved)}`;
}

export const integrationsApi = {
  // Properties
  listProperties: (orgId?: string) =>
    apiFetch<Property[]>(withOrgQuery('/integrations/properties', orgId)),

  createProperty: (data: PropertyCreate, orgId?: string) =>
    apiFetch<PropertyWithKey>(withOrgQuery('/integrations/properties', orgId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getProperty: (id: string, orgId?: string) =>
    apiFetch<PropertyDetail>(withOrgQuery(`/integrations/properties/${id}`, orgId)),

  updateProperty: (id: string, data: PropertyUpdate, orgId?: string) =>
    apiFetch<Property>(withOrgQuery(`/integrations/properties/${id}`, orgId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  archiveProperty: (id: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${id}`, orgId), { method: 'DELETE' }),

  deleteProperty: (id: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${id}`, orgId), { method: 'DELETE' }),

  getPropertyDeleteImpact: (id: string, orgId?: string) =>
    apiFetch<PropertyDeleteImpact>(withOrgQuery(`/integrations/properties/${id}/delete-impact`, orgId)),

  // API Keys
  generateApiKey: (propertyId: string, label: string = 'Default', orgId?: string) =>
    apiFetch<{ api_key: string; api_key_prefix: string; id: string }>(
      withOrgQuery(`/integrations/properties/${propertyId}/keys?label=${encodeURIComponent(label)}`, orgId),
      { method: 'POST' },
    ),

  revokeApiKey: (propertyId: string, keyId: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${propertyId}/keys/${keyId}`, orgId), {
      method: 'DELETE',
    }),

  // Banner association
  getPropertyBanner: (id: string, orgId?: string) =>
    apiFetch<BannerAssociation>(withOrgQuery(`/integrations/properties/${id}/banner`, orgId)),

  setPropertyBanner: (id: string, bannerId: string, orgId?: string) =>
    apiFetch<BannerAssociation>(withOrgQuery(`/integrations/properties/${id}/banner`, orgId), {
      method: 'PUT',
      body: JSON.stringify({ banner_id: bannerId }),
    }),

  removePropertyBanner: (id: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${id}/banner`, orgId), {
      method: 'DELETE',
    }),

  // Snippet
  getSnippet: (id: string, orgId?: string) =>
    apiFetch<SnippetOutput>(withOrgQuery(`/integrations/properties/${id}/snippet`, orgId)),

  emailSnippet: (id: string, email: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${id}/snippet/email`, orgId), {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  logSnippetCopied: (id: string, orgId?: string) =>
    apiFetch<void>(withOrgQuery(`/integrations/properties/${id}/snippet/log-copy`, orgId), {
      method: 'POST',
    }),

  // Verification
  listVerifications: (id: string, orgId?: string) =>
    apiFetch<any[]>(withOrgQuery(`/integrations/properties/${id}/verifications`, orgId)),

  triggerVerification: (id: string, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${id}/verify`, orgId), { method: 'POST' }),

  // Metrics (Coverage & Analytics)
  getCoverageScan: (id: string, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${id}/coverage`, orgId)),

  triggerCoverageScan: (id: string, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${id}/coverage/scan`, orgId), { method: 'POST' }),

  getCoverageHistory: (id: string, orgId?: string) =>
    apiFetch<PageCoverageScan[]>(withOrgQuery(`/integrations/properties/${id}/coverage/history`, orgId)),

  getPropertyEvents: (id: string, limit: number = 50, orgId?: string) =>
    apiFetch<IntegrationEvent[]>(
      withOrgQuery(`/integrations/properties/${id}/events?limit=${limit}`, orgId),
    ),

  listAnalytics: (id: string, days: number = 7, bannerId?: string, orgId?: string) => {
    let url = `/integrations/properties/${id}/analytics?days=${days}`;
    if (bannerId) {
      url += `&banner_id=${bannerId}`;
    }
    return apiFetch<any[]>(withOrgQuery(url, orgId));
  },

  getAnalyticsBanners: (id: string, orgId?: string) =>
    apiFetch<any[]>(withOrgQuery(`/integrations/properties/${id}/analytics/banners`, orgId)),

  // Property Deployments
  listDeployments: (propertyId: string, orgId?: string) =>
    apiFetch<any[]>(withOrgQuery(`/integrations/properties/${propertyId}/deployments`, orgId)),

  createDeployment: (propertyId: string, data: any, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${propertyId}/deployments`, orgId), {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateDeployment: (deploymentId: string, data: any, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/deployments/${deploymentId}`, orgId), {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listDeploymentVersions: (deploymentId: string, orgId?: string) =>
    apiFetch<any[]>(withOrgQuery(`/integrations/deployments/${deploymentId}/versions`, orgId)),

  publishDeploymentVersion: (deploymentId: string, versionId: string, orgId?: string) =>
    apiFetch<any>(
      withOrgQuery(`/integrations/deployments/${deploymentId}/publish/${versionId}`, orgId),
      { method: 'POST' },
    ),

  recordDeploymentHeartbeat: (deploymentId: string, apiKey: string, data: any) =>
    apiFetch<any>(`/public/v1/integrations/sdk/heartbeat/${deploymentId}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(data),
    }),

  // Cookie & Tracker Management
  triggerCookieScan: (propertyId: string, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${propertyId}/cookie-scan`, orgId), {
      method: 'POST',
    }),

  getCookieScanStatus: (propertyId: string, orgId?: string) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${propertyId}/cookie-scan/status`, orgId)),

  listTrackers: (propertyId: string, orgId?: string) =>
    apiFetch<any[]>(withOrgQuery(`/integrations/properties/${propertyId}/trackers`, orgId)),

  updateTrackerOverride: (
    propertyId: string,
    trackerId: string,
    overridden_category?: string,
    action: string = 'auto',
    purpose_id?: string,
    orgId?: string,
  ) =>
    apiFetch<any>(withOrgQuery(`/integrations/properties/${propertyId}/trackers/${trackerId}`, orgId), {
      method: 'PATCH',
      body: JSON.stringify({ overridden_category, action, purpose_id }),
    }),

  // Global / Overview
  getOverviewStats: (orgId?: string) =>
    apiFetch<IntegrationsOverviewStats>(withOrgQuery('/integrations/overview-stats', orgId)),

  getRecentActivity: (limit: number = 10, orgId?: string) =>
    apiFetch<RecentActivityResponse>(withOrgQuery(`/integrations/events?limit=${limit}`, orgId)),

  searchConsent: (query: string, orgId?: string) =>
    apiFetch<ConsentSearchResponse>(
      withOrgQuery(`/integrations/search-consent?query=${encodeURIComponent(query)}`, orgId),
    ),

  getWebhookConfig: (propertyId: string, orgId?: string) =>
    apiFetch<PropertyWebhookConfig>(
      withOrgQuery(`/integrations/properties/${propertyId}/webhook-config`, orgId),
    ),

  updateWebhookConfig: (
    propertyId: string,
    body: PropertyWebhookConfigUpdate,
    orgId?: string,
  ) =>
    apiFetch<PropertyWebhookConfig>(
      withOrgQuery(`/integrations/properties/${propertyId}/webhook-config`, orgId),
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    ),

  redeliverWebhook: (propertyId: string, deliveryId: string, orgId?: string) =>
    apiFetch<Record<string, unknown>>(
      withOrgQuery(
        `/integrations/properties/${propertyId}/webhook-deliveries/${deliveryId}/redeliver`,
        orgId,
      ),
      { method: 'POST' },
    ),

  runConsentExpiryScan: (orgId?: string) =>
    apiFetch<{ scanned: number; dispatched: number; skipped: number }>(
      withOrgQuery('/integrations/webhooks/run-expiry-scan', orgId),
      { method: 'POST' },
    ),

  getDataRightsWebhookConfig: (orgId?: string) =>
    apiFetch<DataRightsWebhookConfig>(
      withOrgQuery('/integrations/data-rights-webhook-config', orgId),
    ),

  updateDataRightsWebhookConfig: (body: PropertyWebhookConfigUpdate, orgId?: string) =>
    apiFetch<DataRightsWebhookConfig>(
      withOrgQuery('/integrations/data-rights-webhook-config', orgId),
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    ),

  listWebhookDeliveries: (propertyId: string, limit = 50, orgId?: string) =>
    apiFetch<WebhookDeliveryLog[]>(
      withOrgQuery(`/integrations/properties/${propertyId}/webhook-deliveries?limit=${limit}`, orgId),
    ),
};
