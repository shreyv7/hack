import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, Clock, X } from 'lucide-react';
import { AccessDenied } from '@/app/components/auth/AccessDenied';
import { ApiError } from '@/lib/api/client';
import * as adminApi from '@/lib/api/admin';
import { canManageOrganizations } from '@/lib/auth/permissions';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types/auth';
import type { Organization } from '@/types/organization';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function PendingApprovals(): ReactElement {
  const { user } = useAuth();
  const [signups, setSignups] = useState<User[]>([]);
  const [orgsById, setOrgsById] = useState<Record<string, Organization>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, orgs] = await Promise.all([
        adminApi.listPendingSignups(),
        adminApi.listOrganizations(),
      ]);
      setSignups(pending);
      setOrgsById(Object.fromEntries(orgs.map((o) => [o.id, o])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load pending signups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManageOrganizations(user)) {
      void load();
    }
  }, [user, load]);

  const signupsPager = useClientPagination(signups);

  if (!canManageOrganizations(user)) {
    return <AccessDenied message="Only superadmins can review pending signups." />;
  }

  const handleApprove = async (signup: User): Promise<void> => {
    setBusyId(signup.id);
    try {
      await adminApi.approveSignup(signup.id);
      notify(`Approved ${signup.email}. We emailed them that they can sign in.`);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (signup: User): Promise<void> => {
    const orgName = signup.organization_id ? orgsById[signup.organization_id]?.name : undefined;
    if (
      !window.confirm(
        `Reject signup from ${signup.email}? This permanently deletes their pending ${
          orgName ? `workspace "${orgName}"` : 'workspace'
        }.`,
      )
    ) {
      return;
    }
    setBusyId(signup.id);
    try {
      await adminApi.rejectSignup(signup.id);
      notify(`Rejected ${signup.email}.`);
      await load();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Pending approvals</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Superadmin — review self-service signups and grant or deny access
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[var(--border-default)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-raised)]"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
      ) : signups.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-10 text-center">
          <Clock className="mx-auto mb-3 size-8 text-[var(--text-secondary)]" />
          <p className="text-sm text-[var(--text-secondary)]">No pending signups right now.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[var(--border-default)] bg-[var(--surface-base)]">
              <tr>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Requested by</th>
                <th className="px-4 py-3 font-medium">Requested at</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {signupsPager.slice.map((s) => {
                const org = s.organization_id ? orgsById[s.organization_id] : undefined;
                const busy = busyId === s.id;
                return (
                  <tr key={s.id} className="border-b border-[var(--border-default)] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-[var(--text-secondary)]" />
                        <span>{org?.name ?? '—'}</span>
                        {org?.slug ? (
                          <span className="text-xs text-[var(--text-secondary)]">/{org.slug}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{s.full_name}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{s.email}</div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-secondary)]">
                      {formatDate(s.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleApprove(s)}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#6f5ff0] px-3 py-1.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
                      >
                        <Check className="size-3.5" />
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleReject(s)}
                        className="inline-flex items-center gap-1 text-sm text-[var(--status-danger)] hover:underline disabled:opacity-60"
                      >
                        <X className="size-3.5" />
                        Reject
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePager
            page={signupsPager.page}
            pageCount={signupsPager.pageCount}
            total={signupsPager.total}
            pageSize={signupsPager.pageSize}
            onPage={signupsPager.setPage}
          />
        </div>
      )}
    </div>
  );
}
