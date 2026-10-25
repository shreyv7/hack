import type { FormEvent, ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { AccessDenied } from '@/app/components/auth/AccessDenied';
import { ApiError } from '@/lib/api/client';
import * as adminApi from '@/lib/api/admin';
import { canManageOrganizations } from '@/lib/auth/permissions';
import { useAuth } from '@/contexts/AuthContext';
import type { Organization, OrganizationStatus } from '@/types/organization';
import { cn } from '@/lib/utils';
import { TablePager } from '@/app/components/common/TablePager';
import { TABLE_PAGE_SIZE, useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function OrganizationManagement(): ReactElement {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrganizations(await adminApi.listOrganizations());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageOrganizations(user)) {
      void loadOrgs();
    }
  }, [user, loadOrgs]);

  if (!canManageOrganizations(user)) {
    return (
      <AccessDenied message="Only superadmins can manage organizations." />
    );
  }

  const handleCreate = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApi.createOrganization({
        org_name: orgName.trim(),
        slug: slug.trim() || slugFromName(orgName),
        admin_email: adminEmail.trim(),
        admin_full_name: adminName.trim(),
      });
      if (result.invite_email_sent) {
        notify(`Organization created. Invite email sent to ${adminEmail.trim()}.`);
      } else {
        notify(
          `Organization created, but no invite email was sent. Add SMTP_PASSWORD (Gmail App Password) to backend/.env, then use Resend invite in Team & Users. Check the API terminal for the temporary password.`,
        );
      }
      setShowCreate(false);
      setOrgName('');
      setSlug('');
      setAdminEmail('');
      setAdminName('');
      await loadOrgs();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to create organization. Is the API running on port 8002?');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (org: Organization, status: OrganizationStatus): Promise<void> => {
    try {
      await adminApi.updateOrganization(org.id, { status });
      await loadOrgs();
      notify(status === 'suspended' ? 'Organization suspended.' : 'Organization activated.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Update failed');
    }
  };

  const { page, setPage, pageCount, pageItems, total, pageSize } = useClientPagination(
    organizations,
    TABLE_PAGE_SIZE,
    organizations.length,
  );

  const handleDelete = async (org: Organization): Promise<void> => {
    if (!window.confirm(`Delete organization "${org.name}" and all its users?`)) {
      return;
    }
    try {
      await adminApi.deleteOrganization(org.id);
      await loadOrgs();
      notify('Organization deleted.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Organizations</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Superadmin — create, suspend, and delete customer organizations
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-[#6f5ff0] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
        >
          <Plus className="size-4" />
          New organization
        </button>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {showCreate ? (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 space-y-4"
        >
          <h2 className="font-medium text-[var(--text-primary)]">Create organization + first admin</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium">Organization name</span>
              <input
                required
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (!slug || slug === slugFromName(orgName)) {
                    setSlug(slugFromName(e.target.value));
                  }
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">Slug</span>
              <input
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="^[a-z0-9]+(?:-[a-z0-9]+)*$"
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">First admin email</span>
              <input
                type="email"
                required
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium">First admin full name</span>
              <input
                required
                value={adminName}
                onChange={(e) => setAdminName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#6f5ff0] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create'}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-default)] bg-[var(--surface-base)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((org) => (
                <tr key={org.id} className="border-b border-[var(--border-default)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-[var(--text-secondary)]" />
                      {org.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{org.slug}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        org.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {org.status === 'active' ? (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(org, 'suspended')}
                        className="text-sm text-amber-700 hover:underline"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(org, 'active')}
                        className="text-sm text-green-700 hover:underline"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDelete(org)}
                      className="inline-flex items-center gap-1 text-sm text-[var(--status-danger)] hover:underline"
                    >
                      <Trash2 className="size-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPage={setPage}
          />
          {organizations.length === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--text-secondary)]">
              No organizations yet.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
