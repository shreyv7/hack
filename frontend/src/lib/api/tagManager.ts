import { apiFetch, getApiBaseUrl } from './client';
import { getAccessToken } from '@/lib/auth/storage';

export interface TagManagerContainer {
  id: string;
  organization_id: string;
  property_id: string;
  provider: string;
  container_name: string;
  container_identifier: string;
  environment: string;
  status: string;
  auto_sync: boolean;
  consent_mode: boolean;
  created_at: string;
  updated_at: string;
  property_domain?: string | null;
}

export interface TagManagerContainerCreate {
  property_id: string;
  provider: string;
  container_name: string;
  container_identifier: string;
  environment: string;
  status?: string;
  auto_sync?: boolean;
  consent_mode?: boolean;
}

export interface TagManagerContainerUpdate {
  provider?: string;
  container_name?: string;
  container_identifier?: string;
  environment?: string;
  status?: string;
  auto_sync?: boolean;
  consent_mode?: boolean;
}

export interface ManagedTag {
  id: string;
  container_id: string;
  property_id: string;
  provider: string;
  purpose_id: string | null;
  tag_name: string;
  trigger: string;
  execution_type: string;
  script_url: string | null;
  inline_script: string | null;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
  purpose_name?: string | null;
}

export interface ManagedTagCreate {
  container_id: string;
  provider: string;
  purpose_id?: string | null;
  tag_name: string;
  trigger: string;
  execution_type: string;
  script_url?: string | null;
  inline_script?: string | null;
  status?: string;
  priority?: number;
}

export interface ManagedTagUpdate {
  provider?: string;
  purpose_id?: string | null;
  tag_name?: string;
  trigger?: string;
  execution_type?: string;
  script_url?: string | null;
  inline_script?: string | null;
  status?: string;
  priority?: number;
}

export interface TagExecutionRule {
  id: string;
  property_id: string;
  priority: number;
  rule_json: any;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TagExecutionRuleCreate {
  property_id: string;
  priority?: number;
  rule_json: any;
  status?: string;
}

export interface TagExecutionRuleUpdate {
  priority?: number;
  rule_json?: any;
  status?: string;
}

export interface TagViolation {
  id: string;
  property_id: string;
  tag_id: string | null;
  page: string;
  severity: string;
  reason: string;
  resolved: boolean;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
  property_domain?: string | null;
  tag_name?: string | null;
  resolved_by_name?: string | null;
}

export interface TagManagerDailyMetric {
  id: string;
  property_id: string;
  date: string;
  executed: number;
  blocked: number;
  analytics: number;
  marketing: number;
  functional: number;
  necessary: number;
}

export interface TagExecutionLog {
  id: string;
  property_id: string;
  tag_id: string | null;
  date: string;
  executed: number;
  blocked: number;
  purpose_name: string;
  tag_name?: string | null;
}

export interface TagManagerSettings {
  id: string;
  property_id: string;
  consent_mode_v2: boolean;
  auto_blocker_strict: boolean;
  datalayer_event_prefix: string;
  blocked_purposes: string[];
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TagManagerSettingsUpdate {
  consent_mode_v2?: boolean;
  auto_blocker_strict?: boolean;
  datalayer_event_prefix?: string;
  blocked_purposes?: string[];
}

export interface SimulatedTagResult {
  tag_id: string;
  tag_name: string;
  provider: string;
  purpose_name: string | null;
  status: 'EXECUTED' | 'BLOCKED';
  reason: string;
  rule_applied?: boolean;
  rule_id?: string | null;
}

export interface SimulationResponse {
  property_id: string;
  results: SimulatedTagResult[];
}

export interface TagManagerOverviewStats {
  connected_properties: number;
  connected_containers: number;
  managed_tags: number;
  blocked_today: number;
  consent_success_rate: number;
  misconfigured_tags: number;
  health_score: number;
  tag_mappings_score: number;
  execution_rules_score: number;
  blocked_violations_score: number;
  stale_containers_score: number;
  purpose_totals: Record<string, number>;
}

export const tagManagerApi = {
  listContainers: async (orgId?: string): Promise<TagManagerContainer[]> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagManagerContainer[]>(`/tag-manager/containers${query}`);
  },
  createContainer: async (data: TagManagerContainerCreate, orgId?: string): Promise<TagManagerContainer> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagManagerContainer>(`/tag-manager/containers${query}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateContainer: async (id: string, data: TagManagerContainerUpdate, orgId?: string): Promise<TagManagerContainer> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagManagerContainer>(`/tag-manager/containers/${id}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteContainer: async (id: string, orgId?: string): Promise<void> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<void>(`/tag-manager/containers/${id}${query}`, {
      method: 'DELETE',
    });
  },
  syncContainer: async (id: string, orgId?: string): Promise<TagManagerContainer> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagManagerContainer>(`/tag-manager/containers/${id}/sync${query}`, {
      method: 'POST',
    });
  },

  listTags: async (params?: { containerId?: string; propertyId?: string; orgId?: string }): Promise<ManagedTag[]> => {
    const queryParams: string[] = [];
    if (params?.containerId) queryParams.push(`container_id=${params.containerId}`);
    if (params?.propertyId) queryParams.push(`property_id=${params.propertyId}`);
    if (params?.orgId) queryParams.push(`org_id=${params.orgId}`);
    const query = queryParams.length > 0 ? `?${queryParams.join('&')}` : '';
    return apiFetch<ManagedTag[]>(`/tag-manager/tags${query}`);
  },
  createTag: async (data: ManagedTagCreate, orgId?: string): Promise<ManagedTag> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<ManagedTag>(`/tag-manager/tags${query}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateTag: async (id: string, data: ManagedTagUpdate, orgId?: string): Promise<ManagedTag> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<ManagedTag>(`/tag-manager/tags/${id}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteTag: async (id: string, orgId?: string): Promise<void> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<void>(`/tag-manager/tags/${id}${query}`, {
      method: 'DELETE',
    });
  },

  listRules: async (propertyId?: string, orgId?: string): Promise<TagExecutionRule[]> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return apiFetch<TagExecutionRule[]>(`/consent-rules${query}`);
  },
  createRule: async (data: TagExecutionRuleCreate, orgId?: string): Promise<TagExecutionRule> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagExecutionRule>(`/consent-rules${query}`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  updateRule: async (id: string, data: TagExecutionRuleUpdate, orgId?: string): Promise<TagExecutionRule> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagExecutionRule>(`/consent-rules/${id}${query}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
  deleteRule: async (id: string, orgId?: string): Promise<void> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<void>(`/consent-rules/${id}${query}`, {
      method: 'DELETE',
    });
  },

  listViolations: async (propertyId?: string, orgId?: string): Promise<TagViolation[]> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return apiFetch<TagViolation[]>(`/violations${query}`);
  },
  resolveViolation: async (id: string, orgId?: string): Promise<TagViolation> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<TagViolation>(`/violations/${id}/resolve${query}`, {
      method: 'POST',
    });
  },

  getAnalytics: async (
    propertyId?: string,
    orgId?: string,
    days = 7,
  ): Promise<TagManagerDailyMetric[]> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    params.push(`days=${days}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return apiFetch<TagManagerDailyMetric[]>(`/analytics${query}`);
  },

  getTagAnalytics: async (
    propertyId?: string,
    orgId?: string,
    days = 7,
  ): Promise<TagExecutionLog[]> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    params.push(`days=${days}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return apiFetch<TagExecutionLog[]>(`/tag-manager/tag-analytics${query}`);
  },

  getOverviewStats: async (
    propertyId?: string,
    orgId?: string,
  ): Promise<TagManagerOverviewStats> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return apiFetch<TagManagerOverviewStats>(`/tag-manager/overview${query}`);
  },

  getSettings: async (propertyId: string, orgId?: string): Promise<TagManagerSettings> => {
    const params: string[] = [`property_id=${propertyId}`];
    if (orgId) params.push(`org_id=${orgId}`);
    return apiFetch<TagManagerSettings>(`/tag-manager/settings?${params.join('&')}`);
  },

  updateSettings: async (
    propertyId: string,
    data: TagManagerSettingsUpdate,
    orgId?: string,
  ): Promise<TagManagerSettings> => {
    const params: string[] = [`property_id=${propertyId}`];
    if (orgId) params.push(`org_id=${orgId}`);
    return apiFetch<TagManagerSettings>(`/tag-manager/settings?${params.join('&')}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  simulate: async (propertyId: string, consentChoices: Record<string, boolean>, orgId?: string): Promise<SimulationResponse> => {
    const query = orgId ? `?org_id=${orgId}` : '';
    return apiFetch<SimulationResponse>(`/simulate${query}`, {
      method: 'POST',
      body: JSON.stringify({
        property_id: propertyId,
        consent_choices: consentChoices,
      }),
    });
  },

  listProviders: async (): Promise<string[]> => {
    return apiFetch<string[]>('/tag-manager/providers');
  },

  downloadGtmTemplate: async (propertyId?: string, orgId?: string): Promise<void> => {
    const params: string[] = [];
    if (propertyId) params.push(`property_id=${propertyId}`);
    if (orgId) params.push(`org_id=${orgId}`);
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    const token = getAccessToken();
    const response = await fetch(`${getApiBaseUrl()}/tag-manager/gtm-template${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) throw new Error('Failed to download GTM template');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'vajra-gtm-template.json';
    anchor.click();
    URL.revokeObjectURL(url);
  },
};
