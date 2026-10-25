export interface JwtPayload {
  sub?: string;
  role?: string;
  org_id?: string;
  exp?: number;
}

/** Decode JWT payload without verification (client-side role hint only). */
export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function getRoleFromToken(token: string | null): string | null {
  if (!token) return null;
  return decodeJwtPayload(token)?.role ?? null;
}
