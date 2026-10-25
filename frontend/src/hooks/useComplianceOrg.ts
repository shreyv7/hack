import { useCallback, useEffect, useState } from 'react';
import { listOrganizations } from '@/lib/api/admin';
import { useAuth } from '@/contexts/AuthContext';
import { canEdit as userCanEdit, hasPermission } from '@/lib/auth/permissions';
import { readStoredOrgId, syncStoredOrgId } from '@/lib/compliance/orgContext';
import type { Organization } from '@/types/organization';

export function useComplianceOrg() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === 'superadmin';
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgIdState] = useState<string>(() =>
    isSuperadmin ? readStoredOrgId() : ''
  );
  const [loading, setLoading] = useState(isSuperadmin);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrgId = isSuperadmin ? selectedOrgId : (user?.organization_id ?? '');
  const hasOrg = Boolean(effectiveOrgId);
  const canEdit =
    userCanEdit(user) &&
    (hasPermission(user, 'compliance.manage') ||
      user?.role === 'admin' ||
      user?.role === 'superadmin' ||
      hasPermission(user, 'security.write'));
  const orgIdParam = isSuperadmin ? selectedOrgId || undefined : undefined;

  const setSelectedOrgId = (id: string) => {
    setSelectedOrgIdState(id);
    syncStoredOrgId(id);
  };

  useEffect(() => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void listOrganizations()
      .then((orgs) => {
        if (cancelled) return;
        setOrganizations(orgs);
        const stored = readStoredOrgId();
        const valid = stored && orgs.some((o) => o.id === stored);
        if (valid) setSelectedOrgIdState(stored);
        else if (orgs[0]) setSelectedOrgId(orgs[0].id);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin]);

  const orgName =
    organizations.find((o) => o.id === selectedOrgId)?.name ?? 'Organization';

  return {
    user,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    effectiveOrgId,
    hasOrg,
    canEdit,
    orgIdParam,
    orgName,
    loading,
    error,
    setError,
  };
}

export function useComplianceLoader<T>(
  loadFn: (orgId?: string) => Promise<T>,
  orgIdParam: string | undefined,
  hasOrg: boolean
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!hasOrg) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await loadFn(orgIdParam);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [hasOrg, loadFn, orgIdParam]);

  const refreshSilent = useCallback(async () => {
    if (!hasOrg) return;
    try {
      const result = await loadFn(orgIdParam);
      setData(result);
    } catch {
      // Keep stale data during background refresh.
    }
  }, [hasOrg, loadFn, orgIdParam]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload, refreshSilent, setData };
}
