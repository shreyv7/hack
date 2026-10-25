import type { ReactElement } from 'react';
import type { ReactNode } from 'react';
import type { Organization } from '@/types/organization';

interface ConsentManagementGateProps {
  title?: string;
  loading: boolean;
  error: string | null;
  hasOrg: boolean;
  isSuperadmin?: boolean;
  organizations?: Organization[];
  selectedOrgId?: string;
  onSelectOrg?: (orgId: string) => void;
  children: ReactNode;
}

export function ConsentManagementGate({
  title = 'Consent Management',
  loading,
  error,
  hasOrg,
  isSuperadmin = false,
  organizations = [],
  selectedOrgId = '',
  onSelectOrg,
  children,
}: ConsentManagementGateProps): ReactElement {
  if (isSuperadmin && !hasOrg) {
    return (
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        <h1 className="mb-2">{title}</h1>
        <p className="text-[var(--text-secondary)] mb-4">
          Choose a tenant organization to manage consent notices and purposes.
        </p>
        {organizations.length > 0 ? (
          <div className="max-w-md">
            <label className="block text-sm font-medium mb-2">Organization</label>
            <select
              value={selectedOrgId}
              onChange={(e) => onSelectOrg?.(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--border-default)] rounded-md bg-[var(--surface-card)] text-[var(--text-primary)]"
            >
              <option value="">Select organization…</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">No organizations found.</p>
        )}
      </div>
    );
  }

  if (!hasOrg) {
    return (
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        <h1 className="mb-2">{title}</h1>
        <p className="text-[var(--text-secondary)]">
          Your account is not linked to an organization. Contact your administrator.
        </p>
      </div>
    );
  }

  const superadminBanner =
    isSuperadmin && organizations.length > 0 ? (
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3">
        <span className="text-sm text-[var(--text-secondary)]">Viewing consent data for:</span>
        <select
          value={selectedOrgId}
          onChange={(e) => onSelectOrg?.(e.target.value)}
          className="min-w-[200px] px-3 py-1.5 text-sm border border-[var(--border-default)] rounded-md bg-[var(--surface-raised)] text-[var(--text-primary)]"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-amber-700 dark:text-amber-300">Superadmin context</span>
      </div>
    ) : null;

  if (loading) {
    return (
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        {superadminBanner}
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-[var(--surface-raised)] rounded mb-6" />
          <div className="h-48 bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-[1280px] mx-auto text-[var(--text-primary)]">
        {superadminBanner}
        <h1 className="mb-2">{title}</h1>
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <>
      {superadminBanner}
      {children}
    </>
  );
}
