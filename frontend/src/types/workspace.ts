export type DeploymentModel = 'public' | 'private' | 'hybrid' | 'on_prem';
export type DpdpRole = 'data_fiduciary' | 'data_processor' | 'significant_data_fiduciary';
export type DpaStatus = 'signed' | 'expired' | 'none' | 'under_review';
export type RoleRequirement =
  | 'required'
  | 'recommended'
  | 'no'
  | 'mandatory'
  | 'mandatory-high-risk';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

export interface DataResidencyRow {
  category: string;
  region: string;
  cross_border: boolean;
  legal_basis: string;
  details: string;
}

export interface DataProcessor {
  id: string;
  name: string;
  processor_role: string;
  purpose: string | null;
  dpa_status: DpaStatus;
  dpa_signed_date: string | null;
  risk_level: string | null;
  data_categories: string | null;
  location: string | null;
  contact_email: string | null;
  
  // TPRM Extensions
  category: string;
  security_score: number;
  monitoring: string;
  logo: string | null;
  last_audit_date: string | null;
  certifications: string[] | null;
  encryption: string | null;
  tier: string;
  assessment_status: string;
  assessment_completed_at: string | null;
  last_monitored_at: string | null;
  monitoring_status: string;
  monitoring_details: Record<string, any> | null;
}

export interface WorkspaceSettings {
  organization: OrganizationSummary;
  registered_address: string | null;
  headquarters: string | null;
  india_presence: string | null;
  solution_description: string | null;
  logo_url: string | null;
  dpo_name: string | null;
  dpo_email: string | null;
  dpo_phone: string | null;
  compliance_version: string | null;
  changelog_summary: string | null;
  self_attested_at: string | null;
  third_party_audit_firm: string | null;
  audit_valid_until: string | null;
  primary_industry: string | null;
  secondary_industries: string[];
  is_significant_data_fiduciary: boolean;
  data_principals_count_band: string | null;
  annual_turnover_band: string | null;
  deployment_model: DeploymentModel;
  primary_region: string | null;
  backup_region: string | null;
  allowed_regions: string[];
  data_residency: DataResidencyRow[];
  dpdp_role: DpdpRole;
  role_assessed_at: string | null;
  role_assessment: Record<string, unknown> | null;
  consent_industry_config: Record<string, unknown> | null;
  processors: DataProcessor[];
}

export interface DpdpObligation {
  id: string;
  sort_order: number;
  obligation: string;
  description: string;
  statute_reference: string;
  df: RoleRequirement;
  dp: RoleRequirement;
  sdf: RoleRequirement;
}

export interface WorkspaceProfileUpdate {
  org_name?: string;
  registered_address?: string | null;
  headquarters?: string | null;
  india_presence?: string | null;
  solution_description?: string | null;
  logo_url?: string | null;
  dpo_name?: string | null;
  dpo_email?: string | null;
  dpo_phone?: string | null;
  compliance_version?: string | null;
  changelog_summary?: string | null;
  self_attested_at?: string | null;
  third_party_audit_firm?: string | null;
  audit_valid_until?: string | null;
}

export interface WorkspaceIndustryUpdate {
  primary_industry?: string | null;
  secondary_industries?: string[];
  is_significant_data_fiduciary?: boolean;
  data_principals_count_band?: string | null;
  annual_turnover_band?: string | null;
}

export interface WorkspaceDeploymentUpdate {
  deployment_model?: DeploymentModel;
  primary_region?: string | null;
  backup_region?: string | null;
  allowed_regions?: string[];
  data_residency?: DataResidencyRow[];
}

export interface WorkspaceRoleMappingUpdate {
  dpdp_role?: DpdpRole;
  role_assessment?: Record<string, unknown>;
}

export interface DataProcessorCreate {
  name: string;
  processor_role?: string;
  purpose?: string | null;
  dpa_status?: DpaStatus;
  dpa_signed_date?: string | null;
  risk_level?: string | null;
  data_categories?: string | null;
  location?: string | null;
  contact_email?: string | null;
  
  // TPRM Extensions
  category?: string;
  security_score?: number;
  monitoring?: string;
  logo?: string | null;
  last_audit_date?: string | null;
  certifications?: string[] | null;
  encryption?: string | null;
  tier?: string;
  assessment_status?: string;
  assessment_completed_at?: string | null;
  last_monitored_at?: string | null;
  monitoring_status?: string;
  monitoring_details?: Record<string, any> | null;
}

export type DataProcessorUpdate = Partial<DataProcessorCreate>;

export interface DiscoveredProcessor {
  name: string;
  source: string;
  risk: string;
  category?: string;
  status?: string;
}

export interface SetupStatus {
  step1_industry: boolean;
  step2_property: boolean;
  step3_adapters?: boolean;
  step3_purposes: boolean;
  step4_notice: boolean;
  step5_banner: boolean;
  step6_translation: boolean;
  step7_monitor: boolean;
}


