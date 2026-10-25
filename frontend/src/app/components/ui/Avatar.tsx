import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { Size } from '@/types';

interface AvatarProps {
  /** Diameter preset. */
  size: Size;
  /** One or two initials displayed inside the circle. */
  initials: string;
}

const SIZE_CLASSES: Record<Size, string> = {
  xs: 'size-6 text-xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-12 text-base',
};

/**
 * Circular avatar that renders user initials on a brand-colored background.
 */
export function Avatar({ size, initials }: AvatarProps): ReactElement {
  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-semibold bg-[var(--brand-primary)] text-white',
        SIZE_CLASSES[size],
      )}
    >
      {initials}
    </div>
  );
}
