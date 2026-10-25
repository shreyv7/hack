export type EnforcementMode = 'disabled' | 'shadow' | 'enforced';
export type DenyBehavior = 'reject' | 'strip_fields' | 'queue_pending';
export type WithdrawalAction =
  | 'suppress'
  | 'mask'
  | 'anonymize'
  | 'delete'
  | 'pseudonymize'
  | 'flag_manual_review';
export type RemediationTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface PropertyEnforcement {
  property_id: string;
  enforcement_mode: EnforcementMode;
  has_decision_signing_secret: boolean;
}

export interface PropertySigningSecret {
  property_id: string;
  signing_secret: string;
  token_ttl_seconds: number;
}

export interface PurposeEnforcementConfig {
  id: string;
  organization_id: string;
  purpose_id: string;
  mode: EnforcementMode;
  deny_behavior: DenyBehavior;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurposeEnforcementConfigUpsert {
  purpose_id: string;
  mode: EnforcementMode;
  deny_behavior: DenyBehavior;
}

export interface PurposeDataMapping {
  id: string;
  organization_id: string;
  purpose_id: string;
  inventory_field_id: string;
  withdrawal_action: WithdrawalAction;
  created_at: string;
  updated_at: string;
}

export interface PurposeDataMappingUpsert {
  purpose_id: string;
  inventory_field_id: string;
  withdrawal_action: WithdrawalAction;
}

export interface EnforcementEvent {
  id: string;
  organization_id: string;
  property_id: string | null;
  purpose_id: string | null;
  principal_fingerprint: string;
  decision: string;
  legal_basis: string;
  effective_mode: string;
  receipt_id: string | null;
  collection_point: string | null;
  latency_ms: number | null;
  occurred_at: string;
}

export interface WithdrawalRemediationTask {
  id: string;
  organization_id: string;
  purpose_id: string;
  inventory_field_id: string;
  principal_id: string;
  property_id: string | null;
  receipt_id: string | null;
  mapping_id: string | null;
  action: WithdrawalAction;
  status: RemediationTaskStatus;
  sla_due_at: string;
  completed_at: string | null;
  notes: string | null;
  proof_vault_record_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalRemediationSummary {
  pending_tasks: number;
  overdue_tasks: number;
  obligations_from_withdrawal: number;
}

export interface CollectionPointRow {
  id: string;
  label: string;
  purposeId: string;
  purposeName: string;
  propertyLabel: string;
  purposeMode: EnforcementMode;
  propertyMode: EnforcementMode;
  mapped: boolean;
  status: 'protected' | 'blocked' | 'unmapped' | 'disabled';
  collectionPoint: string | null;
  lastDecision: string | null;
  lastOccurredAt: string | null;
}
