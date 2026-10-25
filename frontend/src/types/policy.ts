export type PolicyType =
  | 'privacy'
  | 'cookie'
  | 'children'
  | 'employee'
  | 'vendor'
  | 'aup'
  | 'retention'
  | 'incident'
  | 'custom';

export type PolicyVersionStatus = 'draft' | 'review' | 'approved' | 'live' | 'archived';

export type AcknowledgementStatus = 'pending' | 'sent' | 'acknowledged' | 'overdue';

export interface PolicyVersion {
  id: string;
  policy_id: string;
  version_number: number;
  status: PolicyVersionStatus;
  content: string;
  summary: string | null;
  effective_date: string | null;
  published_at: string | null;
  published_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  published_by_name: string | null;
  reviewed_by_name: string | null;
}

export interface PolicySummary {
  id: string;
  title: string;
  policy_type: PolicyType;
  status: PolicyVersionStatus | null;
  version_label: string;
  updated_at: string;
  pending_acknowledgements: number;
  archived_at: string | null;
}

export interface PolicyDetail {
  id: string;
  organization_id: string;
  title: string;
  policy_type: PolicyType;
  current_live_version_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  versions: PolicyVersion[];
}

export interface AcknowledgementSummary {
  policy_id: string;
  policy_title: string;
  version: string;
  audience: string;
  sent: number;
  acknowledged: number;
  pending: number;
  overdue: number;
}

export interface PolicyAcknowledgement {
  id: string;
  organization_id: string;
  policy_id: string;
  policy_version_id: string;
  audience: string;
  recipient_id: string;
  recipient_name: string;
  recipient_email: string | null;
  status: AcknowledgementStatus;
  sent_at: string | null;
  acknowledged_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyActivity {
  id: string;
  action: string;
  policy_title: string;
  policy_version: string;
  user_name: string;
  created_at: string;
}

export interface PolicyStats {
  active_count: number;
  total_versions: number;
  pending_acknowledgements: number;
  auto_published_this_year: number;
}

export interface PolicyGenerateFromRopaResult {
  policy: PolicyDetail;
  source: 'vertex' | 'bedrock' | 'rule_based';
  model_id: string | null;
  is_new_policy: boolean;
}
