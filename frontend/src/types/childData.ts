export type ChildConsentStatus = 'missing' | 'pending' | 'verified' | 'expired';

export interface ChildRecord {
  id: string;
  organization_id: string;
  child_ref: string;
  date_of_birth: string | null;
  age: number | null;
  effective_age: number | null;
  is_minor: boolean;
  detection_method: string | null;
  consent_status: ChildConsentStatus;
  parent_name: string | null;
  parent_email: string | null;
  parent_relationship: string | null;
  consent_verification_method: string | null;
  consent_verified_at: string | null;
  consent_expires_at: string | null;
  consent_requested_at: string | null;
  consent_request_expires_at: string | null;
  profiling_blocked: boolean;
  ad_targeting_blocked: boolean;
  notes: string | null;
  last_activity_at: string | null;
  aged_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaintenanceResult {
  orgs_processed: number;
  sources_scanned: number;
  minors_found: number;
  records_created: number;
  records_updated: number;
  aged_out: number;
  consents_expired: number;
  message: string;
}

export interface ChildRecordCreate {
  child_ref?: string | null;
  date_of_birth?: string | null;
  age?: number | null;
  detection_method?: string | null;
  consent_status?: ChildConsentStatus;
  parent_name?: string | null;
  parent_email?: string | null;
  parent_relationship?: string | null;
  consent_verification_method?: string | null;
  consent_expires_at?: string | null;
  profiling_blocked?: boolean;
  ad_targeting_blocked?: boolean;
  notes?: string | null;
  last_activity_at?: string | null;
}

export type ChildRecordUpdate = Partial<ChildRecordCreate>;

export interface RecordParentalConsent {
  parent_name: string;
  parent_email?: string | null;
  parent_relationship?: string | null;
  verification_method: string;
  expires_at?: string | null;
}

export interface RequestParentalConsentBody {
  parent_email: string;
  parent_name?: string | null;
  parent_relationship?: string | null;
  purpose_note?: string | null;
  consent_validity_days?: number;
  link_expiry_days?: number;
}

export interface ConsentRequestResult {
  record: ChildRecord;
  email_sent: boolean;
  message: string;
}

export interface BulkRequestConsentBody {
  record_ids?: string[];
  statuses?: ChildConsentStatus[];
  purpose_note?: string | null;
  consent_validity_days?: number;
  link_expiry_days?: number;
}

export interface BulkConsentPreview {
  total_matched: number;
  eligible: number;
  skipped_no_email: number;
  by_status: Record<string, number>;
}

export interface BulkConsentResult {
  queued: number;
  skipped_no_email: number;
  message: string;
}

export interface ConsentEvidenceResponse {
  decision?: string;
  parent_name?: string;
  parent_relationship?: string;
  confirmed_guardian?: boolean;
  responded_at?: string;
  ip?: string | null;
  user_agent?: string | null;
}

export interface ConsentEvidenceRequest {
  validity_days?: number;
  purpose_note?: string | null;
  requested_by?: string;
  requested_at?: string;
  bulk?: boolean;
}

export interface ConsentEvidencePayload {
  source?: string; // 'manual' | 'api'
  decision?: string;
  verification_method?: string;
  parent_name?: string;
  parent_relationship?: string;
  confirmed_guardian?: boolean;
  recorded_by?: string;
  responded_at?: string;
  ip?: string | null;
  user_agent?: string | null;
  request?: ConsentEvidenceRequest;
  response?: ConsentEvidenceResponse;
}

export interface ConsentEvidence {
  child_ref: string;
  consent_status: ChildConsentStatus;
  parent_name: string | null;
  parent_email: string | null;
  parent_relationship: string | null;
  consent_verification_method: string | null;
  consent_verified_at: string | null;
  consent_expires_at: string | null;
  consent_requested_at: string | null;
  consent_request_expires_at: string | null;
  aged_out_at: string | null;
  evidence: ConsentEvidencePayload | null;
}

export type RestrictedPurpose = 'processing' | 'profiling' | 'ad_targeting';

export interface EnforcementDecision {
  allowed: boolean;
  purpose: RestrictedPurpose;
  matched: boolean;
  is_minor: boolean;
  consent_status: ChildConsentStatus | null;
  profiling_blocked: boolean | null;
  ad_targeting_blocked: boolean | null;
  child_ref: string | null;
  reason: string;
}

export interface AutoDetectResult {
  minors_found: number;
  records_created: number;
  records_updated: number;
  columns_used: string[];
  message: string;
}

export interface ChildApiInfo {
  enforce_url: string;
  record_consent_url: string;
  has_api_key: boolean;
  api_key_prefix: string | null;
}

export interface ChildDataSummary {
  total_records: number;
  verified_consent: number;
  without_consent: number;
  pending_consent: number;
  expired_consent: number;
  restrictions_active: number;
  consent_rate: number;
}
