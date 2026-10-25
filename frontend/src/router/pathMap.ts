import type { UserRole } from '@/types/auth';
import type { Page } from '@/types';

export interface RouteEntry {
  label: string;
  path: string;
  section: string;
  breadcrumbs: string[];
  roles?: UserRole[];
  hideTopBar?: boolean;
}

/** Sidebar label → URL path (longest match wins in getLabelForPath). */
export const ROUTE_ENTRIES: RouteEntry[] = [
  { label: 'How to Use', path: '/how-to-use', section: 'Guide', breadcrumbs: ['Guide', 'How to Use'] },
  { label: 'Dashboard', path: '/dashboard', section: 'Overview', breadcrumbs: ['Overview', 'Dashboard'] },
  {
    label: 'Compliance Score',
    path: '/compliance/score',
    section: 'Overview',
    breadcrumbs: ['Overview', 'Compliance Score'],
  },
  {
    label: 'Automation Coverage',
    path: '/overview/automation',
    section: 'Overview',
    breadcrumbs: ['Overview', 'Automation Coverage'],
  },
  { label: 'Create Consent', path: '/consent/banner', section: 'Consent Management', breadcrumbs: ['Consent Management', 'Create Consent'] },
  {
    label: 'Consent Notices Manager',
    path: '/consent/notices',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Consent Notices Manager'],
  },
  {
    label: 'Received Consents',
    path: '/consent/received',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Received Consents'],
  },
  {
    label: 'Purpose Registry',
    path: '/consent/purposes',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Purpose Registry'],
  },
  {
    label: 'Cookie & Tracker Manager',
    path: '/scanner/cookies/manager',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Cookie & Tracker Manager'],
  },
  {
    label: 'Multi-Language Editor',
    path: '/consent/languages',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Multi-Language Editor'],
  },
  {
    label: 'Consent Withdrawal Flow',
    path: '/consent/withdrawal',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Consent Withdrawal Flow'],
  },
  {
    label: 'Notice Delivery Channels',
    path: '/consent/channels',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Notice Delivery Channels'],
  },
  {
    label: 'Consent Campaigns',
    path: '/consent/campaigns',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Consent Campaigns'],
  },
  {
    label: 'Pluggable Provider Adapters',
    path: '/consent/provider-adapters',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Pluggable Provider Adapters'],
  },
  { label: 'Proof Vault', path: '/consent/proof-vault', section: 'Consent Management', breadcrumbs: ['Consent Management', 'Proof Vault'] },
  {
    label: 'Consent Enforcement',
    path: '/consent/enforcement',
    section: 'Consent Management',
    breadcrumbs: ['Consent Management', 'Consent Enforcement'],
  },
  {
    label: 'Bank Identifier Settings',
    path: '/consent/banking/identifiers',
    section: 'Advanced Consent Management',
    breadcrumbs: ['Advanced Consent Management', 'Bank Identifier Settings'],
  },
  {
    label: 'Journey & Channel Mapping',
    path: '/consent/banking/journeys',
    section: 'Advanced Consent Management',
    breadcrumbs: ['Advanced Consent Management', 'Journey & Channel Mapping'],
  },
  {
    label: 'Customer Consent Registry',
    path: '/consent/banking/registry',
    section: 'Advanced Consent Management',
    breadcrumbs: ['Advanced Consent Management', 'Customer Consent Registry'],
  },
  {
    label: 'Branch Consent Capture',
    path: '/consent/banking/branch-capture',
    section: 'Advanced Consent Management',
    breadcrumbs: ['Advanced Consent Management', 'Branch Consent Capture'],
  },
  {
    label: 'Merchant Consent Capture',
    path: '/consent/banking/merchant-capture',
    section: 'Advanced Consent Management',
    breadcrumbs: ['Advanced Consent Management', 'Merchant Consent Capture'],
  },
  {
    label: 'Integrations Overview',
    path: '/integrations',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Integrations Overview'],
  },
  {
    label: 'Technical Integration',
    path: '/integrations/website',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Technical Integration'],
  },
  {
    label: 'Technical Integration - Website CMP',
    path: '/integrations/website',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Website CMP'],
  },
  {
    label: 'Technical Integration - Mobile SDK',
    path: '/integrations/mobile',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Mobile SDK Integrations'],
  },
  {
    label: 'Technical Integration - Tag Manager',
    path: '/integrations/tag-manager',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Tag Manager'],
  },
  {
    label: 'Technical Integration - DSAR Widget & Portal',
    path: '/integrations/dsar-widget',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'DSAR Widget & Portal Embed'],
  },
  {
    label: 'Technical Integration - Preference Center & Notice',
    path: '/integrations/preference-center',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Preference Center Embed'],
  },
  {
    label: 'Technical Integration - PII Scanner Agent',
    path: '/integrations/pii-agent',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'PII Scanner Agent'],
  },
  {
    label: 'Technical Integration - Campaign & POS Tracking',
    path: '/integrations/campaign-tracking',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'Campaign & POS Tracking'],
  },
  {
    label: 'Technical Integration - API & Webhooks',
    path: '/integrations/api',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'API & Webhooks'],
  },
  {
    label: 'DPDPA Consent Managers',
    path: '/integrations/consent-managers',
    section: 'Integrations',
    breadcrumbs: ['Integrations', 'DPDPA Consent Managers'],
  },
  {
    label: 'Data Protection Guide',
    path: '/data-protection/guide',
    section: 'Data Protection',
    breadcrumbs: ['Data Protection', 'Data Protection Guide'],
  },
  { label: 'Data Inventory', path: '/data/inventory', section: 'Data Protection', breadcrumbs: ['Data Protection', 'Data Inventory'] },
  { label: 'PII Scanner', path: '/scanner/pii', section: 'Data Protection', breadcrumbs: ['Data Protection', 'PII Scanner'] },
  { label: 'Data Masking', path: '/data/masking', section: 'Data Protection', breadcrumbs: ['Data Protection', 'Data Masking'] },
  {
    label: 'Data Anonymisation',
    path: '/data/anonymisation',
    section: 'Data Protection',
    breadcrumbs: ['Data Protection', 'Data Anonymisation'],
  },
  { label: 'Data Sources', path: '/data/sources', section: 'Data Protection', breadcrumbs: ['Data Protection', 'Data Sources'] },
  {
    label: 'Retention Policies',
    path: '/data/retention',
    section: 'Data Protection',
    breadcrumbs: ['Data Protection', 'Retention Policies'],
  },
  {
    label: "Children's Data",
    path: '/data/children',
    section: 'Data Protection',
    breadcrumbs: ['Data Protection', "Children's Data"],
  },
  {
    label: 'Rights Portal (Public)',
    path: '/rights/portal',
    section: 'Data Principal Rights',
    breadcrumbs: ['Data Principal Rights', 'Rights Portal (Public)'],
  },
  {
    label: 'DSAR SLA Tracker',
    path: '/rights/tracker',
    section: 'Data Principal Rights',
    breadcrumbs: ['Data Principal Rights', 'DSAR SLA Tracker'],
  },
  { label: 'Logs', path: '/rights/logs', section: 'Data Principal Rights', breadcrumbs: ['Data Principal Rights', 'Logs'], roles: ['admin', 'superadmin'] },
  {
    label: 'Compliance Guide',
    path: '/compliance/guide',
    section: 'Compliance',
    breadcrumbs: ['Compliance', 'Compliance Guide'],
  },
  { label: 'DPDPA Map', path: '/compliance/map', section: 'Compliance', breadcrumbs: ['Compliance', 'DPDPA Map'] },
  {
    label: 'Security Safeguards',
    path: '/security/safeguards',
    section: 'Compliance',
    breadcrumbs: ['Compliance', 'Security Safeguards'],
  },
  {
    label: 'Breach Disclosure Wizard',
    path: '/breach',
    section: 'Compliance',
    breadcrumbs: ['Compliance', 'Breach Disclosure Wizard'],
  },
  { label: 'Audit Log (New)', path: '/audit/log', section: 'Compliance', breadcrumbs: ['Compliance', 'Audit Log (New)'] },
  {
    label: 'Governance Guide',
    path: '/governance/guide',
    section: 'Governance',
    breadcrumbs: ['Governance', 'Governance Guide'],
  },
  {
    label: 'Compliance Dashboards',
    path: '/compliance/dashboards',
    section: 'Governance',
    breadcrumbs: ['Governance', 'Compliance Dashboards'],
  },
  { label: 'DPIA Module', path: '/data/dpia', section: 'Governance', breadcrumbs: ['Governance', 'DPIA Module'] },
  { label: 'RoPA Module', path: '/data/ropa', section: 'Governance', breadcrumbs: ['Governance', 'RoPA Module'] },
  {
    label: 'Legitimate Use Registry',
    path: '/governance/advanced/legitimate-use',
    section: 'Advanced Governance',
    breadcrumbs: ['Advanced Governance', 'Legitimate Use Registry'],
  },
  {
    label: 'Regulatory Proceedings',
    path: '/governance/advanced/regulatory-proceedings',
    section: 'Advanced Governance',
    breadcrumbs: ['Advanced Governance', 'Regulatory Proceedings'],
  },
  { label: 'CISO Command Center', path: '/security/ciso', section: 'Governance', breadcrumbs: ['Governance', 'CISO Command Center'] },
  { label: 'Policy Manager', path: '/data/policies', section: 'Governance', breadcrumbs: ['Governance', 'Policy Manager'] },
  {
    label: 'Vendor Risk Intelligence',
    path: '/data/vendors',
    section: 'Governance',
    breadcrumbs: ['Governance', 'Vendor Risk Intelligence'],
  },
  {
    label: 'Cross-Border Transfer',
    path: '/governance/cross-border-transfer',
    section: 'Governance',
    breadcrumbs: ['Governance', 'Cross-Border Transfer'],
  },
  // DISABLED — prototype page
  // {
  //   label: 'Monitoring & Scheduling',
  //   path: '/security/monitoring',
  //   section: 'Governance',
  //   breadcrumbs: ['Governance', 'Monitoring & Scheduling'],
  // },
  { label: 'Workspace Info', path: '/settings/workspace', section: 'Settings', breadcrumbs: ['Settings', 'Workspace Info'] },
  {
    label: 'Deployment Settings',
    path: '/settings/deployment',
    section: 'Settings',
    breadcrumbs: ['Settings', 'Deployment Settings'],
  },
  { label: 'Industry Config', path: '/settings/industry', section: 'Settings', breadcrumbs: ['Settings', 'Industry Config'] },
  { label: 'DPDP Role Mapping', path: '/settings/role-mapping', section: 'Settings', breadcrumbs: ['Settings', 'DPDP Role Mapping'] },
  {
    label: 'Organizations',
    path: '/superadmin/tenants',
    section: 'Administration',
    breadcrumbs: ['Administration', 'Organizations'],
    roles: ['superadmin'],
  },
  {
    label: 'Pending Approvals',
    path: '/superadmin/approvals',
    section: 'Administration',
    breadcrumbs: ['Administration', 'Pending Approvals'],
    roles: ['superadmin'],
  },
  {
    label: 'Team & Users',
    path: '/superadmin/users',
    section: 'Administration',
    breadcrumbs: ['Administration', 'Team & Users'],
    roles: ['admin', 'superadmin'],
  },
  { label: 'Shield AI', path: '/ai/copilot', section: 'Shield AI', breadcrumbs: ['Shield AI'], hideTopBar: true },
];

const EXTRA_BREADCRUMBS: { pattern: RegExp; breadcrumbs: string[]; hideTopBar?: boolean }[] = [
  { pattern: /^\/consent\/notices\/new/, breadcrumbs: ['Consent Management', 'Consent Notices Manager', 'Create Consent Notice'] },
  { pattern: /^\/consent\/notices\/[^/]+\/edit\//, breadcrumbs: ['Consent Management', 'Consent Notices Manager', 'Edit Consent Notice'] },
  { pattern: /^\/consent\/banner\/new/, breadcrumbs: ['Consent Management', 'Create Consent', 'New Banner'] },
  { pattern: /^\/consent\/integration/, breadcrumbs: ['Integrations', 'Consent Manager Integration'] },
  { pattern: /^\/integrations\/website\/[^/]+/, breadcrumbs: ['Integrations', 'Website', 'Property Detail'] },
  { pattern: /^\/integrations\/mobile\/[^/]+/, breadcrumbs: ['Integrations', 'Mobile SDK', 'Property Detail'] },
  { pattern: /^\/breach\/[^/]+\/wizard/, breadcrumbs: ['Compliance', 'Breach Disclosure Wizard', 'Wizard'] },
  { pattern: /^\/breach\/[^/]+/, breadcrumbs: ['Compliance', 'Breach Disclosure Wizard', 'Incident Detail'] },
  { pattern: /^\/scanner\/cookies$/, breadcrumbs: ['Consent Management', 'Cookie & Tracker Manager', 'Cookie Scanner'] },
  { pattern: /^\/ai\/copilot/, breadcrumbs: ['Shield AI'], hideTopBar: true },
  {
    pattern: /^\/governance\/legitimate-use/,
    breadcrumbs: ['Advanced Governance', 'Legitimate Use Registry'],
  },
  {
    pattern: /^\/governance\/regulatory-proceedings/,
    breadcrumbs: ['Advanced Governance', 'Regulatory Proceedings'],
  },
];

/** Legacy Page id → URL (for copilot / notice deep links). */
export const PAGE_TO_PATH: Partial<Record<Page, string>> = {
  'how-to-use': '/how-to-use',
  dashboard: '/dashboard',
  'compliance-score': '/compliance/score',
  'automation-coverage': '/overview/automation',
  'banner-builder': '/consent/banner',
  'consent-notices-manager': '/consent/notices',
  'received-consents': '/consent/received',
  'new-notice': '/consent/notices/new',
  notices: '/consent/notices',
  'purpose-registry-new': '/consent/purposes',
  purposes: '/consent/purposes',
  'cookie-tracker-manager': '/scanner/cookies/manager',
  'cookie-scanner': '/scanner/cookies',
  'multi-language-editor': '/consent/languages',
  'consent-withdrawal-flow': '/consent/withdrawal',
  'notice-delivery-channels': '/consent/channels',
  'consent-campaigns': '/consent/campaigns',
  'pluggable-provider-adapters': '/consent/provider-adapters',
  'proof-vault': '/consent/proof-vault',
  'consent-enforcement': '/consent/enforcement',
  'consent-manager-integration': '/consent/integration',
  'integrations-overview': '/integrations',
  'technical-integration': '/integrations/website',
  'integration-website': '/integrations/website',
  'integration-mobile': '/integrations/mobile',
  'tag-manager': '/integrations/tag-manager',
  'integration-api': '/integrations/api',
  'integration-dsar-widget': '/integrations/dsar-widget',
  'integration-preference-center': '/integrations/preference-center',
  'integration-pii-agent': '/integrations/pii-agent',
  'integration-campaign-tracking': '/integrations/campaign-tracking',
  'dpdpa-consent-managers': '/integrations/consent-managers',
  'data-protection-guide': '/data-protection/guide',
  'data-inventory': '/data/inventory',
  'pii-scanner': '/scanner/pii',
  'data-masking': '/data/masking',
  'data-anonymisation': '/data/anonymisation',
  'data-sources': '/data/sources',
  'retention-policy-manager': '/data/retention',
  'childrens-data': '/data/children',
  portal: '/rights/portal',
  'data-rights-portal-public': '/rights/portal',
  'dsar-sla-tracker': '/rights/tracker',
  'dsar-activity-log': '/rights/logs',
  'compliance-guide': '/compliance/guide',
  'dpdpa-map': '/compliance/map',
  'security-safeguards-hub': '/security/safeguards',
  'breach-disclosure-wizard': '/breach',
  incidents: '/breach',
  'incident-detail': '/breach',
  'audit-log': '/audit/log',
  'governance-guide': '/governance/guide',
  'compliance-dashboard-builder': '/compliance/dashboards',
  'dpia-module': '/data/dpia',
  'ropa-module': '/data/ropa',
  'ciso-command': '/security/ciso',
  'policy-manager': '/data/policies',
  'vendor-risk': '/data/vendors',
  // 'monitoring-scheduling': '/security/monitoring', // DISABLED — prototype page
  'workspace-info': '/settings/workspace',
  'deployment-settings': '/settings/deployment',
  'industry-config': '/settings/industry',
  'dpdp-role-mapping': '/settings/role-mapping',
  'organization-management': '/superadmin/tenants',
  'team-management': '/superadmin/users',
  'pending-approvals': '/superadmin/approvals',
  copilot: '/ai/copilot',
};

export function getPathForLabel(label: string): string | undefined {
  const entry = ROUTE_ENTRIES.find((r) => r.label === label);
  return entry?.path;
}

export function getLabelForPath(pathname: string): string {
  const sorted = [...ROUTE_ENTRIES].sort((a, b) => b.path.length - a.path.length);
  for (const entry of sorted) {
    if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
      return entry.label;
    }
  }
  for (const extra of EXTRA_BREADCRUMBS) {
    if (extra.pattern.test(pathname)) {
      return extra.breadcrumbs[extra.breadcrumbs.length - 1] ?? 'Dashboard';
    }
  }
  return 'Dashboard';
}

export function getBreadcrumbs(pathname: string): string[] {
  for (const extra of EXTRA_BREADCRUMBS) {
    if (extra.pattern.test(pathname)) return extra.breadcrumbs;
  }
  const sorted = [...ROUTE_ENTRIES].sort((a, b) => b.path.length - a.path.length);
  for (const entry of sorted) {
    if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
      return entry.breadcrumbs;
    }
  }
  return ['Overview', 'Dashboard'];
}

export function shouldHideTopBar(pathname: string): boolean {
  if (pathname.startsWith('/ai/copilot')) return true;
  for (const entry of ROUTE_ENTRIES) {
    if (entry.hideTopBar && (pathname === entry.path || pathname.startsWith(`${entry.path}/`))) {
      return true;
    }
  }
  for (const extra of EXTRA_BREADCRUMBS) {
    if (extra.hideTopBar && extra.pattern.test(pathname)) return true;
  }
  return false;
}

export function pageToPath(page: Page): string {
  return PAGE_TO_PATH[page] ?? '/dashboard';
}

export function pathToPage(path: string): Page | undefined {
  const entries = Object.entries(PAGE_TO_PATH) as [Page, string][];
  const sorted = entries.sort((a, b) => b[1].length - a[1].length);
  const match = sorted.find(([, p]) => path === p || path.startsWith(`${p}/`));
  return match?.[0];
}
