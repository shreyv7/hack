import type { User, UserRole } from '@/types/auth';

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  user: 'User',
  ciso: 'CISO',
  legal_head: 'Legal Head',
  legal_counsel: 'Legal Counsel',
  compliance_officer: 'Compliance Officer',
  grievance_officer: 'Grievance Redressal Officer',
  security_analyst: 'Security Analyst',
  data_steward: 'Data Steward',
  auditor: 'Auditor',
  dpo: 'Data Protection Officer',
  it_admin: 'IT Admin',
  branch_operator: 'Branch Operator',
};

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role;
}

export function userInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '?';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function displayName(user: User): string {
  return user.full_name.trim() || user.email;
}
