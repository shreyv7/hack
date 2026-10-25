import type { ReactElement } from 'react';

export function PageLoader(): ReactElement {
  return (
    <div className="flex min-h-[40vh] w-full items-center justify-center bg-[var(--surface-base)]">
      <div className="flex flex-col items-center gap-3">
        <div
          className="size-10 animate-spin rounded-full border-2 border-[var(--border-default)] border-t-[var(--brand-primary)]"
          aria-hidden
        />
        <p className="text-sm text-[var(--text-secondary)]">Loading…</p>
      </div>
    </div>
  );
}
