import type { ReactElement, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ButtonVariant, ControlSize } from '@/types';

interface ButtonProps {
  /** Visual style variant. */
  variant: ButtonVariant;
  /** Size preset. */
  size: ControlSize;
  /** Button label or icon content. */
  children: ReactNode;
  /** Disables interaction and applies muted styling. */
  disabled?: boolean;
  /** Shows a spinner and disables the button while true. */
  loading?: boolean;
  /** Click handler. */
  onClick?: () => void;
  /** Additional CSS classes merged onto the root element. */
  className?: string;
}

const SIZE_CLASSES: Record<ControlSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--brand-primary)] text-white shadow-sm',
  secondary: 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm',
  ghost: 'bg-transparent text-[var(--text-primary)] hover:bg-black/5',
  danger: 'bg-[var(--status-danger)] text-white shadow-sm',
};

/**
 * Primary action button with loading and disabled states.
 */
export function Button({
  variant,
  size,
  children,
  disabled,
  loading,
  onClick,
  className,
}: ButtonProps): ReactElement {
  return (
    <button
      type="button"
      className={cn(
        'font-medium transition-all duration-200 rounded-lg flex items-center justify-center gap-2',
        SIZE_CLASSES[size],
        disabled || loading
          ? 'bg-[var(--surface-raised)] text-[var(--text-tertiary)] cursor-not-allowed shadow-none'
          : VARIANT_CLASSES[variant],
        className,
      )}
      disabled={disabled || loading}
      onClick={onClick}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}
