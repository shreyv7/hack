export type RetentionPeriodUnit = 'days' | 'months' | 'years';
export type TriggerEvent =
  | 'creation_date'
  | 'last_interaction'
  | 'consent_withdrawal'
  | 'contract_end'
  | 'custom';
export type RetentionAction =
  | 'delete'
  | 'anonymize'
  | 'mask'
  | 'pseudonymize'
  | 'archive'
  | 'manual_review';

export interface EvidentiaryProfile {
  dpdpa_minimum_record?: boolean;
  keep_fields?: string[];
  min_retention_days?: number;
  legal_basis_note?: string;
}

export interface RetentionPolicyPreset {
  name: string;
  data_category?: string;
  period_value: number;
  period_unit: RetentionPeriodUnit;
  trigger_event: TriggerEvent;
  legal_basis?: string;
  action: RetentionAction;
  evidentiary_profile?: EvidentiaryProfile;
  notes?: string;
}

export interface RetentionIndustryPresets {
  evidentiary_profile: EvidentiaryProfile;
  policy_presets: RetentionPolicyPreset[];
}
export type PolicyStatus = 'draft' | 'active' | 'paused';
export type RunStatus = 'pending_confirmation' | 'completed' | 'executed' | 'failed';

export interface RetentionPolicy {
  id: string;
  organization_id: string;
  name: string;
  data_category: string | null;
  data_source_id: string | null;
  asset_id: string | null;
  trigger_field: string | null;
  period_value: number;
  period_unit: RetentionPeriodUnit;
  trigger_event: TriggerEvent;
  legal_basis: string | null;
  action: RetentionAction;
  auto_delete: boolean;
  notify_before_days: number;
  status: PolicyStatus;
  notes: string | null;
  evidentiary_profile: EvidentiaryProfile | null;
  retention_days: number;
  enforcement_state: 'enforced' | 'documentation';
  enforcement_reason: string | null;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyImpact {
  enforced: boolean;
  reason: string | null;
  action: RetentionAction;
  cutoff_date: string | null;
  matched: number | null;
  count_note: string | null;
  has_primary_key: boolean | null;
  dependent_tables: string[];
  legal_hold_days: number;
  legal_hold_fields: string[];
  warnings: string[];
}

export interface PolicyCreate {
  name: string;
  data_category?: string | null;
  data_source_id?: string | null;
  asset_id?: string | null;
  trigger_field?: string | null;
  period_value: number;
  period_unit: RetentionPeriodUnit;
  trigger_event: TriggerEvent;
  legal_basis?: string | null;
  action: RetentionAction;
  auto_delete: boolean;
  notify_before_days: number;
  status: PolicyStatus;
  notes?: string | null;
  evidentiary_profile?: EvidentiaryProfile | null;
}

export type PolicyUpdate = Partial<PolicyCreate>;

export interface RetentionRun {
  id: string;
  policy_id: string;
  run_at: string;
  cutoff_date: string | null;
  records_matched: number;
  records_deleted: number;
  action: RetentionAction;
  status: RunStatus;
  certificate_ref: string | null;
  executed_by: string | null;
  detail: string | null;
  created_at: string;
}

export interface RetentionSummary {
  active_policies: number;
  total_policies: number;
  pending_confirmations: number;
  records_flagged: number;
  records_deleted_total: number;
}

export interface RetentionEngineResult {
  policies_evaluated: number;
  runs_created: number;
  runs_executed: number;
  rows_deleted: number;
  flagged: number;
}

// --- application-level obligations (Stage 4) ---

export type ObligationStatus = 'pending' | 'due' | 'fulfilled' | 'on_hold' | 'cancelled';

export interface RetentionObligation {
  id: string;
  organization_id: string;
  subject_ref: string;
  data_category: string | null;
  purpose: string | null;
  policy_id: string | null;
  trigger_event: TriggerEvent;
  action: RetentionAction;
  event_at: string;
  due_at: string;
  legal_hold_until: string | null;
  status: ObligationStatus;
  source: string;
  fulfilled_at: string | null;
  fulfilled_by: string | null;
  evidence: Record<string, unknown> | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObligationCreate {
  subject_ref: string;
  trigger_event: TriggerEvent;
  data_category?: string | null;
  purpose?: string | null;
  occurred_at?: string | null;
  action?: RetentionAction | null;
  retention_days?: number | null;
  notes?: string | null;
}

export interface ObligationSummary {
  total: number;
  pending: number;
  due: number;
  on_hold: number;
  fulfilled: number;
}

export interface ObligationApiInfo {
  events_url: string;
  due_url: string;
  fulfill_url: string;
  has_api_key: boolean;
  api_key_prefix: string | null;
}
