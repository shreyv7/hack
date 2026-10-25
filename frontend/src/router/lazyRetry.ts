import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Wraps React.lazy() with a one-time full-page reload when a dynamic import fails
 * (common after Vite HMR or when the dev server restarts mid-session).
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  moduleId: string,
): LazyExoticComponent<T> {
  return lazy(async () => {
    const storageKey = `lazy-retry:${moduleId}`;
    try {
      const module = await factory();
      sessionStorage.removeItem(storageKey);
      return module;
    } catch (error) {
      const hasReloaded = sessionStorage.getItem(storageKey) === '1';
      if (!hasReloaded) {
        sessionStorage.setItem(storageKey, '1');
        window.location.reload();
        return new Promise(() => {
          // Page is reloading — never resolve.
        });
      }
      sessionStorage.removeItem(storageKey);
      throw error;
    }
  });
}
