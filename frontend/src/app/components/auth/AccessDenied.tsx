import type { ReactElement } from 'react';
import { ShieldAlert } from 'lucide-react';

interface AccessDeniedProps {
  message?: string;
}

export function AccessDenied({
  message = 'You do not have permission to view this page.',
}: AccessDeniedProps): ReactElement {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
      <ShieldAlert className="mb-4 size-12 text-[var(--status-danger)]" strokeWidth={1.5} />
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-[var(--text-secondary)]">{message}</p>
    </div>
  );
}
