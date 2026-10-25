import { getAccessToken, clearAuthStorage } from '@/lib/auth/storage';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (typeof configured === 'string' && configured.trim() !== '') {
    return configured.trim().replace(/\/$/, '');
  }
  // Same-origin /api works in dev (Vite proxy) and production (reverse proxy).
  return '/api';
}

type ApiFetchOptions = RequestInit & {
  /** When false, do not attach Authorization header. Default true. */
  auth?: boolean;
  /** When true, do not redirect to login on 401. */
  skipAuthRedirect?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { auth = true, skipAuthRedirect = false, headers: initHeaders, ...rest } = options;
  const headers = new Headers(initHeaders);

  if (rest.body && !headers.has('Content-Type') && !(rest.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (auth) {
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  const baseUrl = getApiBaseUrl();
  const fullUrl = `${baseUrl}${path}`;

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      ...rest,
      headers,
    });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the API at ${baseUrl}. Start the backend with: uvicorn app.main:app --reload --port 8002`,
    );
  }

  if (!response.ok) {
    if (response.status === 401 && !skipAuthRedirect && !window.location.pathname.endsWith('/login')) {
      clearAuthStorage();
      window.location.href = '/login';
      return new Promise(() => {}); // Halt execution of calling code
    }

    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string | unknown };
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (body.detail !== undefined) {
        detail = JSON.stringify(body.detail);
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
