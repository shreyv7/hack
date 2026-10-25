export interface ComplianceMapSummary {
  sections_covered: number;
  sections_total: number;
  sections_in_scope?: number;
  sections_partial?: number;
  sections_documented_only?: number;
  coverage_percent?: number;
  features_mapped: number;
  compliance_score: number;
  penalty_mitigated_crores: number;
  penalty_worst_crores: number;
  last_reviewed_at: string | null;
  last_reviewed_by: string | null;
}

export interface ComplianceMapChapterSection {
  number: string;
  section_key: string;
  title: string;
  feature_count: number;
  status: string;
}

export interface ComplianceMapChapter {
  number: number;
  title: string;
  sections: ComplianceMapChapterSection[];
}

export interface MappedFeature {
  name: string;
  status: string;
  last_verified: string | null;
  evidence_count: number;
  route: string;
}

export interface ComplianceMapSectionDetail {
  section_key: string;
  title: string;
  statute: string;
  features: MappedFeature[];
  penalty: string;
}

export interface SecuritySafeguardsSummary {
  score: number;
  score_label: string;
  documented_count: number;
  partial_count: number;
  missing_count: number;
  total_controls: number;
  penalty_current_crores: number;
  penalty_worst_crores: number;
  penalty_mitigated_crores: number;
}

export interface SecurityPostureMetric {
  value: number;
  status: 'normal' | 'success' | 'warning' | 'critical';
  status_label: string;
}

export interface SecurityPosture {
  failed_logins_24h: SecurityPostureMetric;
  privileged_sessions: SecurityPostureMetric;
  unencrypted_assets: SecurityPostureMetric;
  mfa_bypass_users: SecurityPostureMetric;
  anomalies: SecurityPostureMetric;
  computed_at: string;
}

export interface SecurityControl {
  id: string;
  control_key: string;
  name: string;
  status: 'documented' | 'partial' | 'missing';
  items_total: number;
  items_completed: number;
  evidence: string | null;
  checklist_items: string[];
}

export interface SecuritySafeguardsData {
  controls: SecurityControl[];
  certifications: Array<{
    name: string;
    status: string;
    valid_until: string | null;
    auditor_firm: string | null;
  }>;
  summary: SecuritySafeguardsSummary;
  posture: SecurityPosture;
}

export interface BreachWizardData {
  affected_count?: string;
  special_categories?: string[];
  data_types?: string[];
  mitigation_actions?: string;
  dpb_board?: string;
  dpb_method?: string;
  incident_summary?: string;
  remediation_steps?: string;
  dp_channels?: string[];
  dp_delivery_auto_configured?: boolean;
  dp_email_subject?: string;
  dp_message_body?: string;
  dp_contact?: string;
  dp_recipient_phone?: string;
  dp_recipient_address?: string;
  public_disclosure_required?: boolean;
  publication_channels?: string[];
  public_statement?: string;
  source_type?: 'dsar_sla';
  source_dsar_request_id?: string;
  source_tracking_id?: string;
  category?: string;
}

export interface BreachIncident {
  id: string;
  incident_ref: string;
  status: string;
  discovered_at: string;
  deadline_at: string;
  deadline_remaining_seconds: number;
  current_step: number;
  severity: string;
  wizard_data: BreachWizardData;
  submitted_at: string | null;
  assigned_to_user_id?: string | null;
  escalated_to_user_id?: string | null;
  escalated_at?: string | null;
}

export interface BreachAffectedVerifyResult {
  affected_count: number;
  log_entries_analyzed: number;
  unique_principals_found: number;
  summary: string;
  shield_ai_used: boolean;
  data_types: string[];
  special_categories: string[];
}

export type AuditEventType =
  | 'Configuration'
  | 'Deletion'
  | 'Consent'
  | 'Access'
  | 'Rights'
  | 'Breach';

export interface AuditEvent {
  id: string;
  time: string;
  actor: string;
  role: string;
  action: string;
  details: string;
  type: AuditEventType;
  severity: string;
  entry_hash: string;
  prev_hash: string;
  resource_type?: string | null;
  resource_id?: string | null;
}

export interface PaginatedAuditEvents {
  items: AuditEvent[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditVerifyResult {
  merkle_root: string;
  entry_count: number;
  integrity_ok: boolean;
  verified_at: string;
}

export interface AuditLogSummary {
  entry_count: number;
  merkle_root: string;
  last_verified_at: string | null;
  integrity_ok: boolean | null;
}
