export type AssetType =
  | 'database'
  | 'application'
  | 'file_system'
  | 'api'
  | 'table'
  | 'collection'
  | 'warehouse'
  | 'other';

export type AssetStatus = 'active' | 'review_needed' | 'archived';

export type FieldClassification = 'unclassified' | 'non_personal' | 'personal' | 'sensitive';

export type SecuritySafeguard = 'none' | 'encryption' | 'masking' | 'obfuscation' | 'tokenization';

export type ClassificationSource = 'manual' | 'heuristic' | 'pii_scanner';

export type AuditAction = 'created' | 'updated' | 'deleted';

export interface InventoryField {
  id: string;
  asset_id: string;
  name: string;
  data_type: string | null;
  classification: FieldClassification;
  pii_category: string | null;
  is_encrypted: boolean;
  security_safeguard: SecuritySafeguard;
  classification_source: ClassificationSource;
  is_child_data: boolean;
  mandatory_retention: boolean;
  mandatory_retention_days: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InventoryAsset {
  id: string;
  organization_id: string;
  data_source_id: string | null;
  data_source_name: string | null;
  name: string;
  asset_type: AssetType;
  location: string | null;
  owner: string | null;
  record_count: string | null;
  description: string | null;
  data_categories: string[];
  status: AssetStatus;
  country: string | null;
  cross_border_transfer: boolean;
  transfer_mechanism: string | null;
  dpia_required: boolean;
  contains_child_data: boolean;
  last_imported_at: string | null;
  field_count: number;
  personal_field_count: number;
  sensitive_field_count: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryAssetDetail extends InventoryAsset {
  fields: InventoryField[];
}

export interface AssetCreate {
  name: string;
  asset_type: AssetType;
  location?: string | null;
  owner?: string | null;
  record_count?: string | null;
  description?: string | null;
  data_categories?: string[];
  status?: AssetStatus;
  data_source_id?: string | null;
  country?: string | null;
  cross_border_transfer?: boolean;
  transfer_mechanism?: string | null;
  dpia_required?: boolean;
  contains_child_data?: boolean;
}

export type AssetUpdate = Partial<AssetCreate>;

export interface FieldCreate {
  name: string;
  data_type?: string | null;
  classification?: FieldClassification;
  pii_category?: string | null;
  is_encrypted?: boolean;
  security_safeguard?: SecuritySafeguard;
  classification_source?: ClassificationSource;
  is_child_data?: boolean;
  mandatory_retention?: boolean;
  mandatory_retention_days?: number | null;
  notes?: string | null;
}

export type FieldUpdate = Partial<FieldCreate>;

export interface InventorySummary {
  total_assets: number;
  total_fields: number;
  personal_fields: number;
  sensitive_fields: number;
  unclassified_fields: number;
  assets_needing_review: number;
}

export interface SchemaImportResult {
  source_id: string;
  tables_found: number;
  assets_created: number;
  assets_updated: number;
  fields_created: number;
  fields_updated: number;
  auto_classified: number;
  message: string;
}

export interface BulkStatusUpdate {
  asset_ids: string[];
  status: AssetStatus;
}

export interface BulkStatusResult {
  updated: number;
}

export interface ProcessorLinkCreate {
  processor_id: string;
  data_categories_shared?: string[];
  notes?: string | null;
}

export interface ProcessorLink {
  id: string;
  asset_id: string;
  processor_id: string;
  processor_name: string;
  processor_dpa_status: string | null;
  data_categories_shared: string[];
  notes: string | null;
  created_at: string;
}

export interface ActivityLinkCreate {
  activity_id: string;
  notes?: string | null;
}

export interface ActivityLink {
  id: string;
  asset_id: string;
  activity_id: string;
  activity_title: string;
  activity_ref: string | null;
  risk_level: string | null;
  notes: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  asset_id: string;
  field_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  action: AuditAction;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface UsagePurposeEntry {
  purpose_id: string;
  purpose_name: string;
  legal_basis: string;
  field_ids: string[];
  field_names: string[];
}

export interface AssetUsageMap {
  asset_id: string;
  asset_name: string;
  purpose_count: number;
  processor_count: number;
  activity_count: number;
  purposes: UsagePurposeEntry[];
  processors: ProcessorLink[];
  activities: ActivityLink[];
}
