const ACCESS_TOKEN_KEY = 'dpdpa_access_token';
const REFRESH_TOKEN_KEY = 'dpdpa_refresh_token';
const MUST_CHANGE_PASSWORD_KEY = 'dpdpa_must_change_password';
const PENDING_EMAIL_KEY = 'dpdpa_pending_email';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getMustChangePassword(): boolean {
  return localStorage.getItem(MUST_CHANGE_PASSWORD_KEY) === 'true';
}

export function setTokens(
  accessToken: string,
  refreshToken: string,
  mustChangePassword: boolean,
): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, String(mustChangePassword));
}

export function setMustChangePassword(value: boolean): void {
  localStorage.setItem(MUST_CHANGE_PASSWORD_KEY, String(value));
}

export function getPendingEmail(): string | null {
  return localStorage.getItem(PENDING_EMAIL_KEY);
}

export function setPendingEmail(email: string): void {
  localStorage.setItem(PENDING_EMAIL_KEY, email);
}

export function clearPendingEmail(): void {
  localStorage.removeItem(PENDING_EMAIL_KEY);
}

export function clearAuthStorage(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(MUST_CHANGE_PASSWORD_KEY);
  clearPendingEmail();
  localStorage.removeItem('dpdpa-authenticated');
}
