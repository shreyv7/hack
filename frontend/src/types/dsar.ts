export type DataRightType =
  | 'access'
  | 'correction'
  | 'erasure'
  | 'nomination'
  | 'grievance'
  | 'withdraw_consent'
  | 'masking'
  | 'anonymization';

export type VerificationStatus = 'unverified' | 'verified';

export type DataRightsRequestStatus =
  | 'pending_verification'
  | 'received'
  | 'in_review'
  | 'response_ready'
  | 'completed'
  | 'rejected';

export interface PortalBranding {
  organization_name: string;
  organization_slug: string;
  dpo_name: string | null;
  dpo_email: string | null;
  contact_email: string | null;
}

export type PortalFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox';

export interface PortalFormField {
  id: string;
  type: PortalFieldType;
  label: string;
  placeholder: string;
  required: boolean;
  key: string;
  locked: boolean;
  options?: string[] | null;
}

export interface PortalFormSchema {
  right_type: DataRightType;
  help_text: string;
  fields: PortalFormField[];
}

export type VerificationMethod = 'email' | 'sms';

export interface PortalRequestCreate {
  right_type: DataRightType;
  requester_name: string;
  requester_email?: string | null;
  requester_phone?: string | null;
  request_details: string;
  extra_data?: Record<string, unknown>;
  verification_method?: VerificationMethod;
}

export interface PortalRequestCreated {
  tracking_id: string;
  status: DataRightsRequestStatus;
  verification_required: boolean;
  verification_method: VerificationMethod;
  contact_hint: string;
  message: string;
}

export interface OtpVerifyResponse {
  verified: boolean;
  tracking_id: string;
  status: DataRightsRequestStatus;
  message: string;
}

export interface StatusCheckResponse {
  tracking_id: string;
  right_type: DataRightType;
  status: DataRightsRequestStatus;
  verification_status: VerificationStatus;
  verification_required: boolean;
  verification_method?: VerificationMethod | null;
  due_at: string | null;
  breached: boolean;
  days_remaining: number | null;
  closure_available: boolean;
  message: string;
}

export interface DataRightsRequest {
  id: string;
  tracking_id: string;
  right_type: DataRightType;
  requester_name: string;
  requester_email: string | null;
  requester_phone: string | null;
  request_details: string;
  extra_data: Record<string, unknown>;
  verification_status: VerificationStatus;
  status: DataRightsRequestStatus;
  received_at: string | null;
  due_at: string | null;
  breached_at: string | null;
  ack_due_at: string | null;
  acknowledged_at: string | null;
  ack_breached_at: string | null;
  assigned_to_user_id: string | null;
  requires_legal_signoff?: boolean;
  legal_signed_off_by_user_id?: string | null;
  closure_text: string | null;
  resolved_at: string | null;
  fulfillment_metadata?: Record<string, unknown> | null;
  retention_hold_applied?: boolean;
  created_at: string;
  updated_at: string;
  days_remaining: number | null;
  ack_hours_remaining: number | null;
  sla_bucket: string | null;
  sla_days: number | null;
}

export interface SlaMetrics {
  on_track: number;
  due_24h: number;
  due_7d: number;
  breached: number;
  ack_overdue: number;
  pending_verification: number;
  total_active: number;
}

export interface SlaMatrixRow {
  right_type: DataRightType;
  sla_days: number;
  sla_label: string | null;
  avg_response_days: number | null;
  success_rate: number | null;
  breaches: number;
  total: number;
}

export interface DsarDashboard {
  metrics: SlaMetrics;
  matrix: SlaMatrixRow[];
  requests: DataRightsRequest[];
  breached_requests: DataRightsRequest[];
}

export const RIGHT_TYPE_LABELS: Record<DataRightType, string> = {
  access: 'Right to Access',
  correction: 'Right to Correction',
  erasure: 'Right to Erasure',
  nomination: 'Nomination',
  grievance: 'Grievance Redressal',
  withdraw_consent: 'Consent Withdrawal',
  masking: 'Data Masking',
  anonymization: 'Data Anonymization',
};

export const DSAR_RIGHT_TYPES: DataRightType[] = [
  'access',
  'correction',
  'erasure',
  'nomination',
  'grievance',
  'withdraw_consent',
  'masking',
  'anonymization',
];

export const STATUS_LABELS: Record<DataRightsRequestStatus, string> = {
  pending_verification: 'Pending verification',
  received: 'Received',
  in_review: 'In review',
  response_ready: 'Response ready',
  completed: 'Completed',
  rejected: 'Rejected',
};

export const KANBAN_COLUMNS: { key: DataRightsRequestStatus; label: string }[] = [
  { key: 'received', label: 'Received' },
  { key: 'in_review', label: 'In Review' },
  { key: 'response_ready', label: 'Response Ready' },
  { key: 'completed', label: 'Completed' },
];

export const USER_KANBAN_COLUMNS: { key: DataRightsRequestStatus; label: string }[] = [
  { key: 'in_review', label: 'In Review' },
  { key: 'response_ready', label: 'Response Ready' },
  { key: 'completed', label: 'Completed' },
];

export type DsarActivityAction =
  | 'request_created'
  | 'identity_verified'
  | 'status_changed'
  | 'assigned'
  | 'unassigned'
  | 'grievance_acknowledged'
  | 'resolved'
  | 'comment_added';

export interface DsarActivityEvent {
  id: string;
  created_at: string;
  tracking_id: string;
  right_type: DataRightType;
  action: DsarActivityAction;
  actor_user_id: string | null;
  actor_name: string;
  assignee_user_id: string | null;
  assignee_name: string | null;
  message: string;
  event_metadata: Record<string, unknown>;
  requester_name: string | null;
  current_status: DataRightsRequestStatus | null;
  current_assignee_user_id: string | null;
}

export interface DsarActivityLog {
  items: DsarActivityEvent[];
  total: number;
}

export const ACTIVITY_ACTION_LABELS: Record<DsarActivityAction, string> = {
  request_created: 'Request created',
  identity_verified: 'Identity verified',
  status_changed: 'Status changed',
  assigned: 'Assigned',
  unassigned: 'Unassigned',
  grievance_acknowledged: 'Grievance acknowledged',
  resolved: 'Resolved',
  comment_added: 'Comment',
};
