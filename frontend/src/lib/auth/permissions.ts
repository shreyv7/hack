import type { Permission, User, UserRole } from '@/types/auth';

const ALL_READ: Permission[] = [
  'dsar.read',
  'breach.read',
  'consent.read',
  'audit.read',
  'compliance.read',
  'security.read',
  'data_asset.read',
  'compliance.dashboard',
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  superadmin: [
    'dsar.read',
    'dsar.write',
    'dsar.assign',
    'dsar.legal_draft',
    'dsar.legal_signoff',
    'grievance.manage',
    'grievance.escalated_approve',
    'grievance.comment',
    'breach.read',
    'breach.log',
    'breach.triage',
    'breach.close',
    'breach.escalation_receive',
    'consent.read',
    'consent.write',
    'consent.review',
    'consent.approve',
    'consent.capture_assisted',
    'audit.read',
    'audit.write',
    'compliance.read',
    'compliance.manage',
    'compliance.dashboard',
    'security.read',
    'security.write',
    'security.policy_override',
    'data_asset.read',
    'data_asset.write',
    'data_asset.approve_scoped',
    'user.manage',
    'workspace.manage',
    'task.assign',
  ],
  admin: [
    'dsar.read',
    'dsar.write',
    'dsar.assign',
    'dsar.legal_draft',
    'dsar.legal_signoff',
    'grievance.manage',
    'grievance.escalated_approve',
    'grievance.comment',
    'breach.read',
    'breach.log',
    'breach.triage',
    'breach.close',
    'breach.escalation_receive',
    'consent.read',
    'consent.write',
    'consent.review',
    'consent.approve',
    'consent.capture_assisted',
    'audit.read',
    'audit.write',
    'compliance.read',
    'compliance.manage',
    'compliance.dashboard',
    'security.read',
    'security.write',
    'security.policy_override',
    'data_asset.read',
    'data_asset.write',
    'data_asset.approve_scoped',
    'user.manage',
    'workspace.manage',
    'task.assign',
  ],
  user: [
    'dsar.read',
    'dsar.write',
    'consent.read',
    'compliance.read',
    'breach.read',
    'audit.read',
    'data_asset.read',
    'security.read',
  ],
  ciso: [
    'breach.read',
    'breach.close',
    'breach.escalation_receive',
    'audit.read',
    'security.read',
    'security.policy_override',
    'compliance.read',
    'compliance.dashboard',
    'dsar.read',
  ],
  legal_head: [
    'dsar.read',
    'dsar.legal_signoff',
    'consent.read',
    'consent.approve',
    'grievance.escalated_approve',
    'audit.read',
    'compliance.read',
    'grievance.comment',
  ],
  legal_counsel: [
    'dsar.read',
    'dsar.legal_draft',
    'consent.read',
    'consent.review',
    'grievance.comment',
    'compliance.read',
  ],
  compliance_officer: [
    'compliance.manage',
    'compliance.dashboard',
    'compliance.read',
    'audit.read',
    'audit.write',
    'task.assign',
    'dsar.read',
    'breach.read',
    'consent.read',
    'security.read',
    'data_asset.read',
  ],
  grievance_officer: [
    'grievance.manage',
    'dsar.read',
    'dsar.write',
    'dsar.assign',
    'grievance.comment',
    'compliance.read',
  ],
  security_analyst: [
    'breach.read',
    'breach.triage',
    'breach.log',
    'security.read',
    'audit.read',
    'compliance.read',
  ],
  data_steward: ['data_asset.read', 'data_asset.approve_scoped', 'compliance.read', 'dsar.read'],
  auditor: [...ALL_READ],
  // DPDPA Section 9/10 statutory DPO — superset of legal_head + workspace settings
  dpo: [
    'dsar.read',
    'dsar.legal_signoff',
    'consent.read',
    'consent.write',
    'consent.approve',
    'consent.capture_assisted',
    'grievance.escalated_approve',
    'grievance.comment',
    'breach.read',
    'audit.read',
    'audit.write',
    'compliance.read',
    'compliance.dashboard',
    'workspace.manage',
  ],
  // IT/Infrastructure Admin — technical settings, no compliance/DSAR governance write
  it_admin: [
    'workspace.manage',
    'security.read',
    'security.write',
    'data_asset.read',
    'data_asset.write',
    'compliance.read',
  ],
  branch_operator: ['consent.read', 'consent.capture_assisted', 'compliance.read'],
};

function permissionsFor(user: User | null): Set<Permission> {
  if (!user) {
    return new Set();
  }
  return new Set(ROLE_PERMISSIONS[user.role] ?? []);
}

export function hasPermission(user: User | null, permission: Permission): boolean {
  return permissionsFor(user).has(permission);
}

export function canManageOrganizations(user: User | null): boolean {
  return user?.role === 'superadmin';
}

export function canManageUsers(user: User | null): boolean {
  return hasPermission(user, 'user.manage');
}

export function canEdit(user: User | null): boolean {
  return user !== null && user.role !== 'auditor';
}

export function isReadOnly(user: User | null): boolean {
  return user?.role === 'auditor';
}

export function isSuperadmin(user: User | null): boolean {
  return user?.role === 'superadmin';
}

export function isOrgAdmin(user: User | null): boolean {
  return user?.role === 'admin';
}

export function isOrgUser(user: User | null): boolean {
  return user?.role === 'user';
}

export function hasRole(user: User | null, ...roles: UserRole[]): boolean {
  return user !== null && roles.includes(user.role);
}

export function canAssignDsar(user: User | null): boolean {
  return hasPermission(user, 'dsar.assign');
}

export function canLegalSignoff(user: User | null): boolean {
  return hasPermission(user, 'dsar.legal_signoff');
}

export function canLegalDraft(user: User | null): boolean {
  return hasPermission(user, 'dsar.legal_draft');
}

export function canTriageBreach(user: User | null): boolean {
  return hasPermission(user, 'breach.triage');
}

export function canCloseBreach(user: User | null): boolean {
  return hasPermission(user, 'breach.close');
}

export function canApproveConsent(user: User | null): boolean {
  return hasPermission(user, 'consent.approve');
}

export function canReviewConsent(user: User | null): boolean {
  return hasPermission(user, 'consent.review');
}

export { ROLE_PERMISSIONS };
