import { apiFetch } from '@/lib/api/client';
import type {
  ChangePasswordPayload,
  LoginCredentials,
  SignupPayload,
  TokenResponse,
  User,
} from '@/types/auth';

export function signup(payload: SignupPayload): Promise<User> {
  return apiFetch<User>('/auth/signup', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(payload),
  });
}

export function login(credentials: LoginCredentials): Promise<TokenResponse> {
  return apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    auth: false,
    body: JSON.stringify(credentials),
  });
}

export function refresh(refreshToken: string): Promise<TokenResponse> {
  return apiFetch<TokenResponse>('/auth/refresh', {
    method: 'POST',
    auth: false,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export function fetchMe(): Promise<User> {
  return apiFetch<User>('/auth/me');
}

export function changePassword(payload: ChangePasswordPayload): Promise<User> {
  return apiFetch<User>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function logout(): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>('/auth/logout', { method: 'POST' });
}
