function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** cmp.js URL — served from the frontend deployment (Vite public/ or Firebase hosting). */
export function getCmpScriptUrl(): string {
  const explicit = import.meta.env.VITE_CMP_SCRIPT_URL;
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return trimTrailingSlash(explicit.trim());
  }

  const publicUrl = import.meta.env.VITE_PUBLIC_URL;
  if (typeof publicUrl === 'string' && publicUrl.trim() !== '') {
    return `${trimTrailingSlash(publicUrl.trim())}/cmp.js`;
  }

  if (typeof window !== 'undefined') {
    return `${window.location.origin}/cmp.js`;
  }

  return '/cmp.js';
}

/** Public CMP API base used by cmp.js (config, consent, events). */
export function getPublicApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_PUBLIC_API_URL;
  if (typeof explicit === 'string' && explicit.trim() !== '') {
    return trimTrailingSlash(explicit.trim());
  }

  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (typeof apiBase === 'string' && apiBase.trim() !== '') {
    const root = trimTrailingSlash(apiBase.trim()).replace(/\/api$/, '');
    return `${root}/public/v1`;
  }

  // Local dev without env: backend runs on 8002 (see docs/startup.md).
  if (typeof window !== 'undefined') {
    if (import.meta.env.DEV) {
      return 'http://127.0.0.1:8002/public/v1';
    }
    return `${trimTrailingSlash(window.location.origin)}/public/v1`;
  }

  return '/public/v1';
}
