import { apiFetch } from '@/lib/api/client';
import type {
  ConsentIndustryConfig,
  ConsentPrincipalDetail,
  ConsentPrincipalSummary,
  IdentifierTypeConfig,
  JourneyConfig,
} from '@/types/consentBanking';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

export function fetchBankingEnabled(orgId?: string): Promise<{ enabled: boolean }> {
  return apiFetch<{ enabled: boolean }>(withOrgQuery('/consent/banking/enabled', orgId));
}

export function fetchBankingConfig(orgId?: string): Promise<ConsentIndustryConfig> {
  return apiFetch<ConsentIndustryConfig>(withOrgQuery('/consent/banking/config', orgId));
}

export function updateBankingConfig(
  body: Partial<{
    enabled: boolean;
    identifier_types: IdentifierTypeConfig[];
    journeys: JourneyConfig[];
    property_journey_map: Record<string, string>;
  }>,
  orgId?: string,
): Promise<ConsentIndustryConfig> {
  return apiFetch<ConsentIndustryConfig>(withOrgQuery('/consent/banking/config', orgId), {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function fetchConsentPrincipals(
  orgId?: string,
  search?: string,
): Promise<ConsentPrincipalSummary[]> {
  const base = withOrgQuery('/consent/banking/principals', orgId);
  const q = search?.trim() ? `${base}${base.includes('?') ? '&' : '?'}search=${encodeURIComponent(search)}` : base;
  return apiFetch<ConsentPrincipalSummary[]>(q);
}

export function fetchConsentPrincipal(
  principalId: string,
  orgId?: string,
): Promise<ConsentPrincipalDetail> {
  return apiFetch<ConsentPrincipalDetail>(
    withOrgQuery(`/consent/banking/principals/${principalId}`, orgId),
  );
}
