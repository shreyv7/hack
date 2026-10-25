export type MaskingStrategy = 'mask' | 'redact' | 'hash' | 'replace' | 'encrypt' | 'generalize';

export interface MaskingRule {
  id: string | null;
  pii_category: string;
  strategy: MaskingStrategy;
  params: Record<string, unknown>;
  enabled: boolean;
  is_default: boolean;
}

export interface MaskingRuleUpsert {
  pii_category: string;
  strategy: MaskingStrategy;
  params?: Record<string, unknown>;
  enabled?: boolean;
}

export interface PreviewResult {
  original: string;
  masked: string;
  strategy: MaskingStrategy;
}

export interface FieldPreviewPair {
  before: string;
  after: string;
}

export interface FieldPreviewResult {
  table: string;
  column: string;
  pii_category: string | null;
  strategy: MaskingStrategy;
  samples: FieldPreviewPair[];
}

export interface ApplyMaskingResult {
  table: string;
  column: string;
  pii_category: string | null;
  strategy: MaskingStrategy;
  rows_updated: number;
}

export interface DetectedEntity {
  entity_type: string;
  score: number;
  masked_sample: string;
}

export interface AnonymizeTextResult {
  original_length: number;
  anonymized_text: string;
  entities: DetectedEntity[];
  ner_engine: string;
}

export interface MaskingCapabilities {
  ner_available: boolean;
  engine: string;
  strategies: string[];
  entity_types: string[];
}

export interface PiiColumnTarget {
  data_source_id: string | null;
  data_source_name: string | null;
  source_type: string | null;
  asset_id: string;
  field_id: string;
  table: string;
  column: string;
  pii_category: string | null;
  classification: string;
  strategy: MaskingStrategy | null;
  rule_enabled: boolean;
  environment: string | null;
  integration_mode: string | null;
  security_safeguard: string | null;
  purpose_count: number;
  last_applied_at: string | null;
  can_apply: boolean;
  apply_note: string | null;
}

export interface MaskingSourceCoverage {
  data_source_id: string;
  data_source_name: string;
  environment: string | null;
  integration_mode: string | null;
  total_pii_fields: number;
  covered_by_rules: number;
  coverage_pct: number;
  maskable: boolean;
}

export interface MaskingSummary {
  total_pii_fields: number;
  covered_by_rules: number;
  coverage_pct: number;
  sources_maskable: number;
  sources_read_write: number;
  columns_applied_last_30d: number;
  uncovered_categories: string[];
  prod_sources_discovery_only: number;
  fields_safeguard_masking_unapplied: number;
  sources: MaskingSourceCoverage[];
}

export type MaskingRunTrigger = 'manual' | 'retention' | 'withdrawal';

export interface MaskingRun {
  id: string;
  organization_id: string;
  data_source_id: string | null;
  data_source_name: string | null;
  asset_id: string | null;
  table_name: string;
  column_name: string;
  pii_category: string | null;
  strategy: MaskingStrategy;
  rows_updated: number;
  trigger: MaskingRunTrigger;
  triggered_by_user_id: string | null;
  proof_vault_record_id: string | null;
  created_at: string;
}

export const STRATEGY_META: Record<
  MaskingStrategy,
  { label: string; note: string; reversible: boolean; dpdpaHint: string }
> = {
  mask: {
    label: 'Mask',
    note: 'Partially hide (•), for display',
    reversible: false,
    dpdpaHint: 'Sec 8(5) — display-layer safeguard; not sufficient alone for erasure (Sec 11).',
  },
  redact: {
    label: 'Redact',
    note: 'Replace with [REDACTED]',
    reversible: false,
    dpdpaHint: 'Irreversible — may satisfy storage limitation if identifiability is removed.',
  },
  hash: {
    label: 'Hash (SHA-256)',
    note: 'Irreversible one-way',
    reversible: false,
    dpdpaHint: 'Pseudonymization — useful for analytics without raw PII exposure.',
  },
  replace: {
    label: 'Replace token',
    note: 'e.g. <EMAIL>',
    reversible: false,
    dpdpaHint: 'Token replacement for non-prod / test environments.',
  },
  encrypt: {
    label: 'Encrypt',
    note: 'Reversible (Fernet)',
    reversible: true,
    dpdpaHint: 'Sec 8(5) encryption safeguard — reversible with key custody.',
  },
  generalize: {
    label: 'Generalize',
    note: 'Reduce precision (year, ranges)',
    reversible: false,
    dpdpaHint: 'Data minimization — reduces identifiability while keeping aggregate utility.',
  },
};
