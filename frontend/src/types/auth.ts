/** Mirrors backend UserRole enum values. */
export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'user'
  | 'ciso'
  | 'legal_head'
  | 'legal_counsel'
  | 'compliance_officer'
  | 'grievance_officer'
  | 'security_analyst'
  | 'data_steward'
  | 'auditor'
  // DPDPA statutory roles
  | 'dpo'
  | 'it_admin'
  | 'branch_operator';

export type UserStatus = 'invited' | 'pending_approval' | 'active' | 'disabled';

export interface User {
  id: string;
  organization_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  status: UserStatus;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  must_change_password: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface ChangePasswordPayload {
  old_password: string;
  new_password: string;
}

export interface SignupPayload {
  company_name: string;
  full_name: string;
  email: string;
  password: string;
}

export type Permission =
  | 'dsar.read'
  | 'dsar.write'
  | 'dsar.assign'
  | 'dsar.legal_draft'
  | 'dsar.legal_signoff'
  | 'grievance.manage'
  | 'grievance.escalated_approve'
  | 'grievance.comment'
  | 'breach.read'
  | 'breach.log'
  | 'breach.triage'
  | 'breach.close'
  | 'breach.escalation_receive'
  | 'consent.read'
  | 'consent.write'
  | 'consent.review'
  | 'consent.approve'
  | 'consent.capture_assisted'
  | 'audit.read'
  | 'audit.write'
  | 'compliance.read'
  | 'compliance.manage'
  | 'compliance.dashboard'
  | 'security.read'
  | 'security.write'
  | 'security.policy_override'
  | 'data_asset.read'
  | 'data_asset.write'
  | 'data_asset.approve_scoped'
  | 'user.manage'
  | 'workspace.manage'
  | 'task.assign';

export interface RoleCatalogEntry {
  value: UserRole;
  label: string;
  description: string;
  permissions: string[];
  invitable: boolean;
}
