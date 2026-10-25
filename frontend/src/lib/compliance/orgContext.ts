/** Session keys used across compliance modules for superadmin tenant selection. */
export const COMPLIANCE_ORG_STORAGE_KEY = 'compliance_org_id';

export const ORG_STORAGE_KEYS = [
  COMPLIANCE_ORG_STORAGE_KEY,
  'consent_org_id',
  'dsar_org_id',
  'workspace_org_id',
] as const;

/** Read the first non-empty org id from any module storage key. */
export function readStoredOrgId(): string {
  try {
    for (const key of ORG_STORAGE_KEYS) {
      const value = sessionStorage.getItem(key);
      if (value) return value;
    }
    return '';
  } catch {
    return '';
  }
}

/** Keep all module org keys in sync when the tenant changes. */
export function syncStoredOrgId(id: string): void {
  try {
    if (id) {
      for (const key of ORG_STORAGE_KEYS) {
        sessionStorage.setItem(key, id);
      }
    } else {
      for (const key of ORG_STORAGE_KEYS) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore storage errors
  }
}

/** Superadmin API calls need `?org_id=`; other roles rely on JWT org. */
export function getOrgIdParamForRole(role: string | undefined): string | undefined {
  if (role !== 'superadmin') return undefined;
  const id = readStoredOrgId();
  return id || undefined;
}
