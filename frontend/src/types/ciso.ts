export interface CisoRequirement {
  id: string;
  framework_id: string;
  domain: string;
  req_key: string;
  title: string;
  description?: string;
}

export interface CisoFramework {
  id: string;
  name: string;
  code: string;
  description?: string;
  requirements: CisoRequirement[];
}

export interface CisoEvidence {
  id: string;
  organization_id: string;
  name: string;
  file_name: string;
  file_type?: string;
  file_hash: string;
  version: number;
  uploader_user_id?: string;
  is_verified: boolean;
  verified_by_user_id?: string;
  verified_at?: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CisoRisk {
  id: string;
  organization_id: string;
  risk_id: string;
  title: string;
  category?: string;
  likelihood: number;
  impact: number;
  score: number;
  owner_user_id?: string;
  status: 'open' | 'treated' | 'accepted';
  treatment?: string;
  residual_score?: number;
  created_at: string;
  updated_at: string;
}

export interface CisoRemediationTask {
  id: string;
  organization_id: string;
  task_ref: string;
  title: string;
  description?: string;
  owner_user_id?: string;
  status: 'open' | 'assigned' | 'in_progress' | 'blocked' | 'completed' | 'overdue';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  due_date?: string;
  created_at: string;
  updated_at: string;
}

export interface CisoException {
  id: string;
  organization_id: string;
  control_id: string;
  exception_type: 'temporary' | 'permanent';
  approved_by_user_id?: string;
  expires_at?: string;
  reason: string;
  compensating_controls?: string;
  created_at: string;
}

export interface CisoControlComment {
  id: string;
  control_id: string;
  comment: string;
  author_user_id?: string;
  created_at: string;
}

export interface CisoControlReview {
  id: string;
  control_id: string;
  reviewer_user_id?: string;
  outcome: string;
  notes?: string;
  created_at: string;
}

export interface CisoControl {
  id: string;
  organization_id: string;
  control_key: string;
  title: string;
  description?: string;
  tech_explanation?: string;
  business_explanation?: string;
  why_required?: string;
  penalty_if_absent?: string;
  status: 'healthy' | 'warning' | 'critical' | 'not_configured' | 'in_progress' | 'exception';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  maturity?: string;
  tags: string[];
  owner_user_id?: string;
  assets_covered: any[];
  linked_policies: any[];
  linked_vendors: any[];
  linked_dpias: any[];
  linked_ropas: any[];
  linked_audit_logs: any[];
  requirements: CisoRequirement[];
  evidence: CisoEvidence[];
  risks: CisoRisk[];
  remediation_tasks: CisoRemediationTask[];
  exceptions: CisoException[];
  comments: CisoControlComment[];
  reviews: CisoControlReview[];
  created_at: string;
  updated_at: string;
}

export interface CisoScoreSettings {
  id: string;
  organization_id: string;
  controls_weight: number;
  evidence_weight: number;
  risks_weight: number;
  policies_weight: number;
  vendors_weight: number;
  incidents_weight: number;
  thresholds: {
    healthy: number;
    warning: number;
    [key: string]: number;
  };
}

export interface CisoScoreSnapshot {
  id: string;
  overall_score: number;
  controls_score: number;
  evidence_score: number;
  risks_score: number;
  policies_score: number;
  vendors_score: number;
  incidents_score: number;
  recorded_date: string;
}

export interface CisoBoardReport {
  id: string;
  title: string;
  file_url?: string;
  score_snapshot: Record<string, number>;
  created_at: string;
}

export interface CisoDashboardSummary {
  scores: Record<string, number>;
  previous_scores: Record<string, number>;
  risk_matrix: number[][];
  penalty_exposure: {
    current_exposure_crores: number;
    maximum_possible_crores: number;
    estimated_mitigated_crores: number;
    reasons: string[];
    affected_controls: Array<{ id: string; key: string; title: string }>;
  };
  control_health: {
    coverage_percent: number;
    evidence_percent: number;
    automation_percent: number;
    total_controls: number;
    healthy: number;
    warning: number;
    critical: number;
    in_progress: number;
    exception: number;
    not_configured: number;
  };
  mttr_metrics: {
    mttd_hours: number;
    mttr_hours: number;
    open_incidents: number;
    closed_incidents: number;
    sla_achievement_percent: number;
  };
  board_summary: {
    posture: string;
    top_risks: string[];
    top_wins: string[];
    pending_actions: string;
    compliance_readiness: string;
  };
}

export interface CisoControlVersion {
  id: string;
  control_id: string;
  organization_id: string;
  version_number: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  assets_covered: any[];
  linked_policies: any[];
  linked_vendors: any[];
  linked_ropas: any[];
  linked_dpias: any[];
  modified_by_user_id?: string;
  change_summary?: string;
  archived_at: string;
}

export interface CisoActivity {
  id: string;
  organization_id: string;
  actor_user_id?: string;
  entity_type: string;
  entity_id: string;
  activity_type: string;
  payload: Record<string, any>;
  description: string;
  created_at: string;
}

export interface CisoOrganizationControl {
  id: string;
  organization_id: string;
  control_key: string;
  title: string;
  description?: string;
  status: 'healthy' | 'warning' | 'critical' | 'not_configured' | 'in_progress' | 'exception';
  priority: 'low' | 'medium' | 'high' | 'critical';
  mapped_ciso_control_id?: string;
  cis_mappings: string[];
  iso_mappings: string[];
  dpdpa_mappings: string[];
  nist_mappings: string[];
  created_at: string;
  updated_at: string;
}
