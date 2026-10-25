export interface SecurityChecklistSource {
  module: string;
  route: string;
  signal: string;
  verify: string;
}

/** Maps each control checklist item to the platform module and live signal used by safeguards sync. */
export const SECURITY_CHECKLIST_SOURCES: Record<string, SecurityChecklistSource[]> = {
  encryption: [
    {
      module: 'Data Inventory',
      route: '/data/inventory',
      signal: 'data_inventory_fields.is_encrypted + field classification',
      verify:
        'Counts personal/sensitive inventory fields and checks that none are marked unencrypted.',
    },
    {
      module: 'Platform deployment',
      route: '/settings/deployment',
      signal: 'Deployment TLS configuration (platform baseline)',
      verify: 'Assumed satisfied when the API is served over TLS in production deployments.',
    },
    {
      module: 'Data Inventory',
      route: '/data/inventory',
      signal: 'Encrypted classified fields inventory coverage',
      verify:
        'Requires classified personal/sensitive fields to exist and all of them to be marked encrypted.',
    },
    {
      module: 'PII Scanner',
      route: '/scanner/pii',
      signal: 'pii_scan_jobs count',
      verify: 'At least one PII scan job has been run for this organization.',
    },
  ],
  access_mfa: [
    {
      module: 'Team & roles',
      route: '/superadmin/users',
      signal: 'users.role (admin / superadmin) count',
      verify: 'At least one active org admin or superadmin account exists (RBAC in use).',
    },
    {
      module: 'Team & roles',
      route: '/superadmin/users',
      signal: 'users.must_change_password for admin accounts',
      verify:
        'All active admin accounts have completed initial password setup (proxy for MFA / secure onboarding).',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries count',
      verify: 'Audit activity exists, indicating privileged actions are being recorded and reviewable.',
    },
    {
      module: 'Team & roles',
      route: '/superadmin/users',
      signal: 'users.must_change_password (session / credential hygiene)',
      verify: 'No active admin accounts are flagged must_change_password (session hardening signal).',
    },
  ],
  logging: [
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries count (≥ 5)',
      verify: 'Central audit trail has at least five recorded events.',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries count (≥ 20)',
      verify: 'Sufficient audit volume for alerting rules to be exercised.',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries older than 30 days',
      verify: 'Events older than 30 days are retained in the append-only audit ledger.',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries severity (warning / critical)',
      verify: 'No open warning/critical audit events, or high event volume indicates active monitoring.',
    },
    {
      module: 'Breach Manager',
      route: '/breach',
      signal: 'breach_incidents status (open vs closed)',
      verify: 'Breach incidents are documented and none remain open without closure.',
    },
  ],
  deletion: [
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries event_type=deletion (or general audit activity)',
      verify: 'Deletion events or broader audit activity demonstrates documented deletion procedures.',
    },
    {
      module: 'Retention policies',
      route: '/data/retention',
      signal: 'audit_log_entries event_type=deletion',
      verify: 'At least one deletion event is recorded (automated retention enforcement signal).',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries event_type=deletion',
      verify: 'Deletion events logged for secure wipe / decommissioning activity.',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries event_type=deletion (≥ 3)',
      verify: 'Multiple deletion audit entries form a repeatable deletion trail.',
    },
  ],
  vuln_mgmt: [
    {
      module: 'PII Scanner',
      route: '/scanner/pii',
      signal: 'pii_scan_jobs count',
      verify: 'Regular vulnerability-style scans via PII scanner jobs.',
    },
    {
      module: 'CISO Command Center',
      route: '/security/ciso',
      signal: 'ciso_risks open count (≤ 3)',
      verify: 'Open CISO risks are within acceptable threshold for patch / remediation SLA.',
    },
    {
      module: 'CISO Command Center',
      route: '/security/ciso',
      signal: 'ciso_risks open count (= 0)',
      verify: 'No open risks remain — annual pen-test / remediation cycle signal.',
    },
  ],
  incident_response: [
    {
      module: 'Breach Manager',
      route: '/breach',
      signal: 'breach_incidents count',
      verify: 'At least one breach incident record exists (IR plan exercised in platform).',
    },
    {
      module: 'Breach Disclosure Wizard',
      route: '/breach',
      signal: 'breach_incidents + 72h DPB workflow',
      verify: 'Breach incidents use the 72-hour DPB notification wizard.',
    },
    {
      module: 'Breach Manager',
      route: '/breach',
      signal: 'breach_incidents closed vs open',
      verify: 'Incidents have been submitted/closed (tabletop / exercise completion signal).',
    },
    {
      module: 'Workspace settings',
      route: '/settings/workspace',
      signal: 'organization_settings.dpo_email',
      verify: 'DPO contact email is configured for incident escalation contacts.',
    },
  ],
  bcp_dr: [
    {
      module: 'Deployment settings',
      route: '/settings/deployment',
      signal: 'organization_settings.primary_region + deployment_model',
      verify: 'Primary region and deployment model are documented in workspace deployment settings.',
    },
    {
      module: 'Deployment settings',
      route: '/settings/deployment',
      signal: 'organization_settings.backup_region',
      verify: 'Backup / DR region is configured in deployment settings.',
    },
    {
      module: 'Deployment settings',
      route: '/settings/deployment',
      signal: 'primary_region + backup_region together',
      verify: 'Both primary and backup regions are set (RTO/RPO definition signal).',
    },
    {
      module: 'Audit Log',
      route: '/audit/log',
      signal: 'audit_log_entries count (> 10)',
      verify: 'Operational audit history supports backup restoration testing evidence.',
    },
  ],
};

export function getSecurityChecklistSource(
  controlKey: string,
  itemIndex: number,
): SecurityChecklistSource | null {
  const items = SECURITY_CHECKLIST_SOURCES[controlKey];
  if (!items || itemIndex < 0 || itemIndex >= items.length) return null;
  return items[itemIndex];
}
