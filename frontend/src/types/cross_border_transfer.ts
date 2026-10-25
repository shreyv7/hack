export type TransferStatus = 'draft' | 'active' | 'suspended' | 'terminated';
export type ContractStatus = 'draft' | 'under_review' | 'approved' | 'signed' | 'expired';

export interface CbtTransfer {
  id: string;
  organization_id: string;
  data_processor_id?: string;
  name: string;
  destination_country: string;
  country_code: string;
  destination_entity: string;
  transfer_purpose?: string;
  legal_basis: string;
  adequacy_status: string;
  safeguard_mechanism?: string;
  status: TransferStatus;
  is_sdf_transfer: boolean;
  dpia_required: boolean;
  dpia_completed_at?: string;
  next_review_date?: string;
  created_by_user_id?: string;
  dpia_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CbtContractVersion {
  id: string;
  contract_id: string;
  version_number: number;
  status: ContractStatus;
  content: string;
  summary?: string;
  published_at?: string;
  published_by_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CbtContract {
  id: string;
  organization_id: string;
  transfer_id: string;
  title: string;
  status: ContractStatus;
  current_live_version_id?: string;
  created_at: string;
  updated_at: string;
}

export interface CbtContractDetail extends CbtContract {
  versions: CbtContractVersion[];
}

export interface CbtSdfAssessment {
  id: string;
  organization_id: string;
  transfer_id: string;
  assessment_date: string;
  assessor_name: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  findings?: string;
  mitigation_measures?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CbtActivity {
  id: string;
  organization_id: string;
  transfer_id?: string;
  action: string;
  transfer_name: string;
  user_name: string;
  details?: Record<string, any>;
  created_at: string;
}

export interface CbtDashboardKpis {
  total_transfers: number;
  active_transfers: number;
  signed_contracts: number;
  pending_sdf_assessments: number;
  restricted_countries_alert_count: number;
}
