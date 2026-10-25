import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { PillStatus } from '@/types';

interface StatusPillProps {
  /** Status value that determines the pill's color treatment. */
  status: PillStatus;
  /** Optional override label. Defaults to the uppercased status value. */
  label?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

const STATUS_STYLES: Record<PillStatus, string> = {
  live: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-700',
  archived: 'bg-gray-100 text-gray-500',
  pending_legal: 'bg-amber-100 text-amber-800',
  pending_dpo: 'bg-orange-100 text-orange-800',
  dpo_approved: 'bg-emerald-100 text-emerald-800',
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
  critical: 'bg-red-100 text-red-700',
  resolved: 'bg-green-100 text-green-700',
  open: 'bg-blue-100 text-blue-700',
  closed: 'bg-gray-100 text-gray-500',
  verified: 'bg-green-100 text-green-700',
  consent: 'bg-blue-100 text-blue-700',
  'legit-use': 'bg-purple-100 text-purple-700',
  contract: 'bg-indigo-100 text-indigo-700',
  'legal-obligation': 'bg-orange-100 text-orange-700',
};

/**
 * Compact, color-coded pill that communicates the lifecycle or severity
 * status of an entity (e.g. a notice, incident, or data subject request).
 */
export function StatusPill({ status, label, className }: StatusPillProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium',
        STATUS_STYLES[status],
        className,
      )}
    >
      {label ?? status.toUpperCase()}
    </span>
  );
}
