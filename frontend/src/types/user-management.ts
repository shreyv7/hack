import type { UserRole, UserStatus, RoleCatalogEntry } from '@/types/auth';

export interface UserInvitePayload {
  email: string;
  full_name: string;
  role: UserRole;
}

export interface UserUpdatePayload {
  full_name?: string;
  role?: UserRole;
  status?: UserStatus;
}

export type { RoleCatalogEntry };
