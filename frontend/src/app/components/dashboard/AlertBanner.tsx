import type { ReactElement } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';

interface AlertBannerProps {
  message: string;
  onConfigure: () => void;
  onDismiss: () => void;
}

/**
 * Warning banner for onboarding or children's-data compliance gaps.
 */
export function AlertBanner({ message, onConfigure, onDismiss }: AlertBannerProps): ReactElement {
  return (
    <div className="flex items-center gap-4 px-6 py-4 border-b bg-[var(--status-warning-bg)] border-[var(--status-warning)]">
      <AlertTriangle className="size-5 shrink-0 text-[var(--status-warning)]" />
      <p className="flex-1 text-sm text-[var(--text-primary)]">{message}</p>
      <Button variant="primary" size="sm" onClick={onConfigure}>
        Configure →
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors shrink-0"
        aria-label="Dismiss alert"
      >
        <X className="size-4 text-[var(--text-secondary)]" />
      </button>
    </div>
  );
}
