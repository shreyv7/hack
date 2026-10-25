export interface PropertySettings {
  environment: 'production' | 'staging' | 'development';
  blocker_mode: 'strict' | 'standard' | 'off';
  auto_language: boolean;
  default_language: string;
  geo_targeting: Record<string, any>;
  allowed_origins: string[];
  advanced_metadata: Record<string, any>;
}

export interface Property {
  id: string;
  organization_id: string;
  domain: string;
  display_name: string | null;
  property_type: 'website' | 'android' | 'ios' | 'tag_manager' | 'server' | 'api';
  environment: 'production' | 'staging' | 'development';
  status: 'pending_setup' | 'active' | 'paused' | 'archived' | 'verification_failed';
  blocker_mode: 'strict' | 'standard' | 'off';
  auto_language: boolean;
  default_language: string;
  allowed_origins?: string[];
  consent_notice_id: string | null;
  active_banner: BannerAssociation | null;
  active_banner_name: string | null;
  created_at: string;
  updated_at: string;
  health_score: number;
  health_grade: string;
  last_updated_time: string | null;
  settings: PropertySettings;
  api_key_prefix?: string;
  name?: string;
}

export interface PropertyWithKey extends Property {
  api_key: string;        // full key, shown once
  api_key_prefix: string;
}

export interface PropertyDetail extends Property {
  api_keys: ApiKeyRead[];
  // Will add verification and coverage fields in later phases
}

export interface BannerAssociation {
  property_id: string;
  banner_id: string;
  status: 'active' | 'inactive';
  activated_at: string;
  banner_name?: string;
  banner_version?: string;
}

export interface ApiKeyRead {
  id: string;
  key_prefix: string;
  label: string;
  status: 'active' | 'revoked';
  last_used_at: string | null;
  created_at: string;
  created_by: string | null;
}

export interface SnippetOutput {
  html: string;
  npm_install: string;
  gtm_template_url: string;
}

export interface PropertyCreate {
  domain: string;
  display_name?: string;
  property_type?: 'website' | 'android' | 'ios' | 'tag_manager' | 'server' | 'api';
  environment: 'production' | 'staging' | 'development';
  blocker_mode: 'strict' | 'standard' | 'off';
  default_language: string;
  settings?: PropertySettings;
}

export interface PropertyUpdate {
  display_name?: string;
  property_type?: 'website' | 'android' | 'ios' | 'tag_manager' | 'server' | 'api';
  environment?: 'production' | 'staging' | 'development';
  blocker_mode?: 'strict' | 'standard' | 'off';
  auto_language?: boolean;
  default_language?: string;
  consent_notice_id?: string | null;
  status?: 'pending_setup' | 'active' | 'paused' | 'archived' | 'verification_failed';
  settings?: Partial<PropertySettings>;
}

export interface IntegrationsOverviewStats {
  active_integrations: number;
  connected_cms: number;
  events_24h: number;
  cross_cm_synced: number;
}

export interface RecentActivityEvent {
  id: string;
  status: 'success' | 'warning' | 'error';
  text: string;
  source: string;
  time: string;
  action?: string;
}

export interface RecentActivityResponse {
  events: RecentActivityEvent[];
}

export interface ConsentSearchTimelineEvent {
  id: string;
  property_id: string;
  property_domain: string;
  session_id: string;
  event_type: string;
  ip_hash: string;
  language: string;
  consented_purposes: string[];
  created_at: string;
}

export interface ConsentSearchResponse {
  results: ConsentSearchTimelineEvent[];
}

export interface IntegrationEvent {
  id: string;
  property_id: string;
  event_type: string;
  session_id: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  url: string | null;
  payload: Record<string, any>;
  created_at: string;
}

export interface PropertyWebhookConfig {
  property_id: string;
  banner_id: string | null;
  url: string | null;
  signing_secret_set?: boolean;
  subscribed_events?: string[];
  bearer_token_set?: boolean;
}

export interface PropertyWebhookConfigUpdate {
  url?: string | null;
  signing_secret?: string | null;
  subscribed_events?: string[] | null;
  bearer_token?: string | null;
}

export interface DataRightsWebhookConfig {
  organization_id: string;
  url: string | null;
  signing_secret_set?: boolean;
  subscribed_events?: string[];
  bearer_token_set?: boolean;
}

export interface WebhookDeliveryLog {
  id: string;
  property_id: string;
  event: string;
  url: string;
  status_code: number | null;
  status_text: string;
  latency_ms: number;
  success: boolean;
  payload: Record<string, unknown>;
  error: string | null;
  attempts?: number | null;
  is_test: boolean;
  created_at: string;
}

export type { PageCoverageScan } from './integration_metrics';

export interface PropertyDeleteImpact {
  property_name: string;
  active_banners_count: number;
  containers_count: number;
  scanned_pages_count: number;
  cookies_scanned_count: number;
  api_keys_count: number;
  consent_receipts_count: number;
  has_relations: boolean;
}
