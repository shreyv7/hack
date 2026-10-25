import type { ReactElement } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { Button } from '@/app/components/ui/Button';

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    return error.statusText || `Error ${error.status}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Something went wrong loading this page.';
}

function isChunkLoadError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('importing a module script failed') ||
    lower.includes('failed to fetch dynamically imported module') ||
    lower.includes('failed to fetch') ||
    lower.includes('loading chunk') ||
    lower.includes('dynamically imported module')
  );
}

/** Friendly fallback when a lazy route chunk fails to load (common after Vite HMR restarts). */
export function RouteErrorFallback(): ReactElement {
  const error = useRouteError();
  const navigate = useNavigate();
  const message = errorMessage(error);
  const chunkError = isChunkLoadError(message);

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-8 bg-[var(--surface-base)]">
      <div className="max-w-lg w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center">
        <h1 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          {chunkError ? 'Page failed to load' : 'Unexpected error'}
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          {chunkError
            ? 'The app was updated or the dev server restarted. Reload to fetch the latest module bundle.'
            : message}
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button variant="secondary" size="md" onClick={() => navigate('/dashboard')}>
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
