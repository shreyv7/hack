import type { ReactElement } from 'react';
import { Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PenaltyChipProps {
  /** Penalty amount in crore rupees (numeric or pre-formatted string). */
  amount: number | string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Highlighted chip that displays a DPDPA penalty amount in crore rupees.
 */
export function PenaltyChip({ amount, className }: PenaltyChipProps): ReactElement {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
        'bg-[var(--status-danger-bg)] border border-[var(--status-danger)]',
        className,
      )}
    >
      <Shield className="size-4 text-[var(--status-danger)]" />
      <span className="font-semibold text-sm text-[var(--status-danger)]">₹{amount} Crore</span>
    </div>
  );
}
