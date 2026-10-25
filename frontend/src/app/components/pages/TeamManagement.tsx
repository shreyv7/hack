import type { FormEvent, ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Trash2, UserPlus } from 'lucide-react';
import { AccessDenied } from '@/app/components/auth/AccessDenied';
import { ApiError } from '@/lib/api/client';
import * as adminApi from '@/lib/api/admin';
import * as usersApi from '@/lib/api/users';
import { canManageUsers, isSuperadmin } from '@/lib/auth/permissions';
import { roleLabel } from '@/lib/auth/display';
import { useAuth } from '@/contexts/AuthContext';
import type { RoleCatalogEntry, User, UserRole } from '@/types/auth';
import type { Organization } from '@/types/organization';
import { TablePager } from '@/app/components/common/TablePager';
import { useClientPagination } from '@/app/hooks/useClientPagination';
import { notify } from '@/app/utils/notify';

export function TeamManagement(): ReactElement {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('user');
  const [roleCatalog, setRoleCatalog] = useState<RoleCatalogEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const invitableRoles = useMemo(
    () => roleCatalog.filter((r) => r.invitable && r.value !== 'superadmin'),
    [roleCatalog]
  );
  const selectedRoleInfo = invitableRoles.find((r) => r.value === inviteRole);

  const superadmin = isSuperadmin(currentUser);

  useEffect(() => {
    void usersApi.listRoles().then(setRoleCatalog).catch(() => setRoleCatalog([]));
  }, []);

  const loadUsers = useCallback(async () => {
    if (!canManageUsers(currentUser)) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const orgFilter = superadmin && selectedOrgId ? selectedOrgId : undefined;
      const list = await usersApi.listUsers(orgFilter);
      setUsers(list.filter((u) => u.role !== 'superadmin'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [currentUser, superadmin, selectedOrgId]);

  useEffect(() => {
    if (!canManageUsers(currentUser)) {
      return;
    }
    if (superadmin) {
      adminApi
        .listOrganizations()
        .then(setOrganizations)
        .catch(() => setOrganizations([]));
    }
  }, [currentUser, superadmin]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const usersPager = useClientPagination(users);

  useEffect(() => {
    usersPager.resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgId]);

  if (!canManageUsers(currentUser)) {
    return (
      <AccessDenied message="Only admins and superadmins can manage team members." />
    );
  }

  const handleInvite = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (superadmin && !selectedOrgId) {
      setError('Select an organization before inviting a user.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await usersApi.inviteUser(
        {
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
        },
        superadmin ? selectedOrgId : undefined,
      );
      notify('Invite sent with a temporary password by email.');
      setShowInvite(false);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('user');
      await loadUsers();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to invite user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRoleChange = async (target: User, role: UserRole): Promise<void> => {
    try {
      await usersApi.updateUser(target.id, { role });
      await loadUsers();
      notify('Role updated.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update role');
    }
  };

  const handleStatusChange = async (target: User): Promise<void> => {
    const next = target.status === 'disabled' ? 'active' : 'disabled';
    try {
      await usersApi.updateUser(target.id, { status: next });
      await loadUsers();
      notify(next === 'disabled' ? 'User disabled.' : 'User enabled.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to update status');
    }
  };

  const handleDelete = async (target: User): Promise<void> => {
    if (!window.confirm(`Remove user ${target.email}?`)) {
      return;
    }
    try {
      await usersApi.deleteUser(target.id);
      await loadUsers();
      notify('User deleted.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to delete user');
    }
  };

  const handleResend = async (target: User): Promise<void> => {
    try {
      await usersApi.resendInvite(target.id);
      notify('Invite resent with a new temporary password.');
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to resend invite');
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Team & users</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {superadmin
              ? 'Superadmin — invite and manage users in any organization'
              : 'Admin — invite and manage users in your organization'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInvite((v) => !v)}
          className="flex items-center gap-2 rounded-lg bg-[#6f5ff0] px-4 py-2 text-sm font-medium text-white hover:opacity-95"
        >
          <UserPlus className="size-4" />
          Invite user
        </button>
      </div>

      {superadmin ? (
        <div className="mb-4">
          <label className="text-sm font-medium text-[var(--text-primary)]">
            Organization
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="mt-1 block w-full max-w-md rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
            >
              <option value="">All organizations</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Select an organization before inviting a user.
          </p>
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {showInvite ? (
        <form
          onSubmit={handleInvite}
          className="mb-6 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 space-y-4"
        >
          <h2 className="font-medium">Invite user</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm sm:col-span-1">
              <span className="font-medium">Email</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-1">
              <span className="font-medium">Full name</span>
              <input
                required
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm sm:col-span-1">
              <span className="font-medium">Role</span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
              >
                {invitableRoles.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedRoleInfo ? (
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)] p-3 text-xs text-[var(--text-secondary)]">
              <p className="font-medium text-[var(--text-primary)]">{selectedRoleInfo.label}</p>
              <p className="mt-1">{selectedRoleInfo.description}</p>
              <p className="mt-2 font-medium text-[var(--text-primary)]">Permissions</p>
              <p className="mt-1">{selectedRoleInfo.permissions.join(', ')}</p>
            </div>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-[#6f5ff0] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? 'Sending…' : 'Send invite'}
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
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersPager.slice.map((u) => (
                <tr key={u.id} className="border-b border-[var(--border-default)] last:border-0">
                  <td className="px-4 py-3">{u.full_name}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{u.email}</td>
                  <td className="px-4 py-3">
                    {u.id === currentUser?.id ? (
                      <span>{roleLabel(u.role)}</span>
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) =>
                          void handleRoleChange(u, e.target.value as UserRole)
                        }
                        className="rounded border border-[var(--border-default)] px-2 py-1 text-sm"
                      >
                        {invitableRoles.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">{u.status}</td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {u.status === 'invited' ? (
                      <button
                        type="button"
                        title="Resend invite"
                        onClick={() => void handleResend(u)}
                        className="inline-flex text-[var(--text-secondary)] hover:text-[#6f5ff0]"
                      >
                        <Mail className="size-4" />
                      </button>
                    ) : null}
                    {u.id !== currentUser?.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(u)}
                          className="text-sm hover:underline"
                        >
                          {u.status === 'disabled' ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(u)}
                          className="inline-flex text-[var(--status-danger)] hover:underline"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <TablePager
            page={usersPager.page}
            pageCount={usersPager.pageCount}
            total={usersPager.total}
            pageSize={usersPager.pageSize}
            onPage={usersPager.setPage}
          />
          {users.length === 0 ? (
            <p className="p-6 text-center text-sm text-[var(--text-secondary)]">No users found.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
