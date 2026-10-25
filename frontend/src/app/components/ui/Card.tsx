import type { ReactElement, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { CardVariant } from '@/types';

interface CardProps {
  /** Visual style variant. */
  variant: CardVariant;
  /** Card body content. */
  children: ReactNode;
}

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default: 'bg-[var(--surface-card)] border border-[var(--border-default)]',
  elevated:
    'bg-[var(--surface-card)] border border-[var(--border-default)] shadow-[0_4px_12px_rgba(0,0,0,0.06),0_2px_4px_rgba(0,0,0,0.04)]',
  interactive:
    'bg-[var(--surface-card)] border border-[var(--border-default)] cursor-pointer hover:shadow-md hover:-translate-y-0.5',
};

/**
 * Surface container with optional elevation and interactive hover treatment.
 */
export function Card({ variant, children }: CardProps): ReactElement {
  return (
    <div className={cn('p-6 rounded-xl transition-all duration-200', VARIANT_CLASSES[variant])}>
      {children}
    </div>
  );
}
