import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface PenaltyChipProps {
  /** Maximum penalty amount, expressed in crore (₹). */
  amount: number;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Monospaced chip that displays a DPDPA penalty amount in crore rupees.
 */
export function PenaltyChip({ amount, className }: PenaltyChipProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 text-red-700 font-mono text-sm',
        className,
      )}
    >
      <span className="text-red-500">₹</span>
      {amount} Cr
    </span>
  );
}
