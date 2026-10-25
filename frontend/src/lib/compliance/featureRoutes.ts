import type { Page } from '@/types';
import { PAGE_TO_PATH } from '@/router/pathMap';

/**
 * Feature route slugs from the compliance map API → in-app paths.
 * Mirrors backend `PAGE_ROUTE_PATHS` in compliance_map_service.py.
 */
export const FEATURE_ROUTE_PATHS: Record<string, string> = {
  'consent-notices-manager': '/consent/notices',
  'proof-vault': '/consent/proof-vault',
  'audit-log': '/audit/log',
  'dsar-sla-tracker': '/rights/tracker',
  'security-safeguards-hub': '/security/safeguards',
  'banner-builder': '/consent/banner',
  'purpose-registry-new': '/consent/purposes',
  'data-inventory': '/data/inventory',
  'pii-scanner': '/scanner/pii',
  'ropa-module': '/data/ropa',
  'dpia-module': '/data/dpia',
  'breach-disclosure-wizard': '/breach',
  'childrens-data': '/data/children',
  'ciso-command': '/security/ciso',
  'vendor-risk': '/data/vendors',
  'policy-hub': '/data/policies',
  'policy-manager': '/data/policies',
  'retention-policy-manager': '/data/retention',
  'data-masking': '/data/masking',
  'data-anonymisation': '/data/anonymisation',
  'monitoring-scheduling': '/security/monitoring',
  'multi-language-editor': '/consent/languages',
  'notice-delivery-channels': '/consent/channels',
  'pluggable-provider-adapters': '/consent/provider-adapters',
  'consent-manager-integration': '/integrations/consent-managers',
  'data-rights-portal-public': '/rights/portal',
  'compliance-score': '/compliance/score',
  'compliance-map': '/compliance/map',
  'dpdpa-map': '/compliance/map',
  'cookie-tracker-manager': '/scanner/cookies/manager',
  'consent-withdrawal-flow': '/consent/withdrawal',
  'deployment-settings': '/settings/deployment',
  'legitimate-use-registry': '/governance/advanced/legitimate-use',
  'grievance-operations': '/rights/tracker?right=grievance',
  'nomination-operations': '/rights/tracker?right=nomination',
  'regulatory-proceedings': '/governance/advanced/regulatory-proceedings',
};

/** Resolve a feature route slug (or path) to an in-app navigation path. */
export function featureRouteToPath(route: string): string {
  if (!route) return '/compliance/map';
  if (route.startsWith('/')) return route;
  return FEATURE_ROUTE_PATHS[route] ?? PAGE_TO_PATH[route as Page] ?? '/compliance/map';
}
