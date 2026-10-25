import type { FieldClassification } from '@/types/dataInventory';

export type ScanStatus = 'running' | 'completed' | 'failed';
export type FindingStatus = 'detected' | 'dismissed';

export interface PiiFinding {
  id: string;
  scan_job_id: string;
  asset_id: string | null;
  field_id: string | null;
  data_source_id: string | null;
  data_source_name: string | null;
  table_name: string;
  column_name: string;
  pii_category: string;
  classification: FieldClassification;
  match_count: number;
  sample_count: number;
  confidence: number;
  example_masked: string | null;
  status: FindingStatus;
  created_at: string;
  /** DPDPA compliance-linkage flags, computed server-side. */
  has_purpose_mapping: boolean;
  has_retention_policy: boolean;
  is_child_data: boolean;
  cross_border_transfer: boolean;
  data_source_region: string | null;
}

export interface BulkDismissRequest {
  finding_ids?: string[];
  data_source_id?: string | null;
  pii_category?: string | null;
  min_confidence?: number | null;
}

export interface BulkDismissResult {
  dismissed: number;
  message: string;
}

export interface ScanJob {
  id: string;
  organization_id: string;
  data_source_id: string | null;
  status: ScanStatus;
  sample_size: number;
  tables_scanned: number;
  columns_scanned: number;
  fields_flagged: number;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  triggered_by: string | null;
  created_at: string;
}

export interface ScanJobDetail extends ScanJob {
  findings: PiiFinding[];
}

export interface CategoryCount {
  category: string;
  label: string;
  count: number;
}

export interface PiiScanSummary {
  total_scans: number;
  total_findings: number;
  sensitive_findings: number;
  fields_flagged: number;
  last_scan_at: string | null;
  by_category: CategoryCount[];
  running_scans: number;
  sources_scannable: number;
  sources_scanned: number;
  findings_without_purpose: number;
  findings_without_retention: number;
  children_data_findings: number;
  cross_border_findings: number;
}

export type ScanFrequency = 'daily' | 'weekly' | 'monthly';

export interface ScanSchedule {
  id: string;
  organization_id: string;
  data_source_id: string;
  data_source_name: string | null;
  frequency: ScanFrequency;
  sample_size: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

export interface ScheduleCreateRequest {
  data_source_id: string;
  frequency: ScanFrequency;
  sample_size?: number;
  is_active?: boolean;
}

export interface ScheduleUpdateRequest {
  frequency?: ScanFrequency;
  sample_size?: number;
  is_active?: boolean;
}
