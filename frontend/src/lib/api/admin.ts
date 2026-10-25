import { apiFetch } from '@/lib/api/client';
import type {
  Organization,
  OrganizationCreatePayload,
  OrganizationUpdatePayload,
  OrganizationWithAdmin,
} from '@/types/organization';
import type { User } from '@/types/auth';

export function listOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>('/admin/organizations');
}

export function createOrganization(
  payload: OrganizationCreatePayload,
): Promise<OrganizationWithAdmin> {
  return apiFetch<OrganizationWithAdmin>('/admin/organizations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateOrganization(
  orgId: string,
  payload: OrganizationUpdatePayload,
): Promise<Organization> {
  return apiFetch<Organization>(`/admin/organizations/${orgId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteOrganization(orgId: string): Promise<void> {
  return apiFetch<void>(`/admin/organizations/${orgId}`, { method: 'DELETE' });
}

export function listAllUsers(orgId?: string): Promise<User[]> {
  const query = orgId ? `?org_id=${encodeURIComponent(orgId)}` : '';
  return apiFetch<User[]>(`/admin/users${query}`);
}

export function listPendingSignups(): Promise<User[]> {
  return apiFetch<User[]>('/admin/signups');
}

export function approveSignup(userId: string): Promise<User> {
  return apiFetch<User>(`/admin/signups/${userId}/approve`, { method: 'POST' });
}

export function rejectSignup(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/signups/${userId}/reject`, { method: 'POST' });
}
