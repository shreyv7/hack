export type AnonymisationTechnique =
  | 'k_anonymity'
  | 'l_diversity'
  | 'differential_privacy'
  | 'pseudonymization'
  | 'generalization'
  | 'suppression'
  | 'date_shifting';

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';
export type ScheduleKind = 'one_time' | 'daily' | 'weekly' | 'monthly';
export type FieldRole = 'identifier' | 'quasi_identifier' | 'sensitive' | 'insensitive';
export type FieldTreatment =
  | 'keep'
  | 'suppress'
  | 'pseudonymize'
  | 'generalize'
  | 'mask'
  | 'date_shift'
  | 'dp_noise';

export interface FieldRule {
  field: string;
  role: FieldRole;
  treatment: FieldTreatment;
}

export interface DatasetOption {
  asset_id: string;
  name: string;
  source_label: string | null;
  source_type: string | null;
  field_count: number;
}

export interface DatasetPreview {
  asset_id: string;
  dataset_name: string;
  source_label: string | null;
  columns: string[];
  suggested_rules: FieldRule[];
}

export interface AnonymisationJob {
  id: string;
  organization_id: string;
  name: string;
  asset_id: string | null;
  dataset_name: string | null;
  source_label: string | null;
  technique: AnonymisationTechnique;
  k_threshold: number;
  l_threshold: number;
  field_rules: FieldRule[];
  status: JobStatus;
  records_processed: number;
  records_suppressed: number;
  k_value: number | null;
  risk_percent: number | null;
  risk_level: string | null;
  output_filename: string | null;
  output_destination: string;
  output_source_id: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  epsilon: number | null;
  schedule: ScheduleKind;
  next_run_at: string | null;
  run_count: number;
  last_monitored_at: string | null;
  monitor_k: number | null;
  monitor_risk_percent: number | null;
  monitor_status: string | null;
  business_purpose: string | null;
  requested_by_email: string | null;
  output_recipient: string | null;
  external_sharing: boolean;
  cross_border_expected: boolean;
  proof_vault_record_id: string | null;
  technique_class: string | null;
  created_at: string;
  updated_at: string;
}

export interface DownloadJustification {
  purpose: string;
  shared_with: string;
  recipient_type?: string | null;
  notes?: string | null;
  acknowledge: boolean;
}

export interface DownloadLog {
  id: string;
  job_id: string;
  downloaded_by_email: string | null;
  file_name: string | null;
  purpose: string;
  shared_with: string;
  recipient_type: string | null;
  notes: string | null;
  created_at: string;
}

export interface AnonymisationJobCreate {
  name: string;
  asset_id: string;
  technique: AnonymisationTechnique;
  k_threshold: number;
  l_threshold: number;
  epsilon: number;
  schedule: ScheduleKind;
  output_destination: string;
  output_source_id?: string | null;
  business_purpose: string;
  output_recipient: string;
  external_sharing?: boolean;
  cross_border_expected?: boolean;
  field_rules?: FieldRule[] | null;
}

export interface RiskPreviewRequest {
  asset_id: string;
  technique: AnonymisationTechnique;
  k_threshold: number;
  l_threshold: number;
  epsilon: number;
  field_rules?: FieldRule[] | null;
}

export interface RiskPreviewResult {
  sample_rows: number;
  predicted_k: number;
  risk_percent: number | null;
  risk_level: string | null;
  estimated_suppressed: number;
  estimated_suppression_rate: number;
  quasi_identifiers: string[];
  sensitive_fields: string[];
  rules: FieldRule[];
  note: string | null;
}

export interface AnonymisationSummary {
  datasets_anonymised: number;
  total_records: number;
  total_jobs: number;
  running_jobs: number;
  drift_jobs: number;
  avg_risk_percent: number | null;
  lowest_k: number | null;
  /** @deprecated use total_jobs */
  active_jobs?: number;
}

export const TECHNIQUE_LABELS: Record<AnonymisationTechnique, string> = {
  k_anonymity: 'k-Anonymity',
  l_diversity: 'l-Diversity',
  differential_privacy: 'Differential Privacy',
  pseudonymization: 'Pseudonymization',
  generalization: 'Generalization',
  suppression: 'Suppression',
  date_shifting: 'Date Shifting',
};

export const TREATMENT_LABELS: Record<FieldTreatment, string> = {
  keep: 'Keep',
  suppress: 'Suppress',
  pseudonymize: 'Pseudonymize',
  generalize: 'Generalize',
  mask: 'Mask',
  date_shift: 'Date shift',
  dp_noise: 'DP noise',
};

export const SCHEDULE_LABELS: Record<ScheduleKind, string> = {
  one_time: 'Run immediately (one-time)',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const ROLE_LABELS: Record<FieldRole, string> = {
  identifier: 'Direct identifier',
  quasi_identifier: 'Quasi-identifier',
  sensitive: 'Sensitive',
  insensitive: 'Non-personal',
};
