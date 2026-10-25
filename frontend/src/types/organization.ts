import type { User } from '@/types/auth';

export type OrganizationStatus = 'active' | 'suspended';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationCreatePayload {
  org_name: string;
  slug: string;
  admin_email: string;
  admin_full_name: string;
}

export interface OrganizationUpdatePayload {
  name?: string;
  status?: OrganizationStatus;
}

export interface OrganizationWithAdmin {
  organization: Organization;
  admin_user: User;
  invite_email_sent: boolean;
}
