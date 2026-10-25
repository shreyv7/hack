import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { StatusVariant } from '@/types';

interface BadgeProps {
  /** Semantic color variant. */
  variant: StatusVariant;
  /** Badge label content. */
  children: React.ReactNode;
  /** When true, renders a colored dot before the label. */
  dot?: boolean;
}

const VARIANT_CLASSES: Record<StatusVariant, { container: string; dot: string }> = {
  success: {
    container: 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
    dot: 'bg-[var(--status-success)]',
  },
  warning: {
    container: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
    dot: 'bg-[var(--status-warning)]',
  },
  danger: {
    container: 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]',
    dot: 'bg-[var(--status-danger)]',
  },
  info: {
    container: 'bg-[var(--status-info-bg)] text-[var(--status-info)]',
    dot: 'bg-[var(--status-info)]',
  },
  ai: {
    container: 'bg-[var(--status-ai-bg)] text-[var(--status-ai)]',
    dot: 'bg-[var(--status-ai)]',
  },
  neutral: {
    container: 'bg-[var(--surface-raised)] text-[var(--text-secondary)]',
    dot: 'bg-[var(--text-tertiary)]',
  },
};

/**
 * Compact status badge with optional leading dot indicator.
 */
export function Badge({ variant, children, dot }: BadgeProps): ReactElement {
  const colors = VARIANT_CLASSES[variant];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        colors.container,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', colors.dot)} />}
      {children}
    </span>
  );
}
