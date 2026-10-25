import { apiFetch } from '@/lib/api/client';
import type { User, UserRole, RoleCatalogEntry } from '@/types/auth';
import type { UserInvitePayload, UserUpdatePayload } from '@/types/user-management';

export function listRoles(): Promise<RoleCatalogEntry[]> {
  return apiFetch<RoleCatalogEntry[]>('/users/roles');
}

export function listUsers(orgId?: string, role?: UserRole): Promise<User[]> {
  const params = new URLSearchParams();
  if (orgId) {
    params.set('org_id', orgId);
  }
  if (role) {
    params.set('role', role);
  }
  const query = params.toString();
  return apiFetch<User[]>(`/users${query ? `?${query}` : ''}`);
}

export function inviteUser(payload: UserInvitePayload, orgId?: string): Promise<User> {
  const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
  return apiFetch<User>(`/users/invite${query}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUser(userId: string, payload: UserUpdatePayload): Promise<User> {
  return apiFetch<User>(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteUser(userId: string): Promise<void> {
  return apiFetch<void>(`/users/${userId}`, { method: 'DELETE' });
}

export function resendInvite(userId: string): Promise<User> {
  return apiFetch<User>(`/users/${userId}/resend-invite`, { method: 'POST' });
}
