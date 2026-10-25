import type { ReactElement } from 'react';
import { ChevronDown } from 'lucide-react';

interface TableRowProps {
  /** Cell values rendered left-to-right across the row. */
  data: string[];
  /** When true, renders a leading checkbox column. */
  selectable?: boolean;
  /** When true, renders a trailing expand chevron. */
  expandable?: boolean;
}

/**
 * Single data table row with optional selection checkbox and expand affordance.
 */
export function TableRow({ data, selectable, expandable }: TableRowProps): ReactElement {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[var(--border-default)] hover:bg-black/5 transition-colors">
      {selectable ? (
        <input
          type="checkbox"
          className="size-4 rounded accent-[var(--brand-primary)]"
        />
      ) : null}
      {data.map((cell, index) => (
        <div key={`${index}-${cell}`} className="flex-1 text-sm font-mono text-[var(--text-primary)]">
          {cell}
        </div>
      ))}
      {expandable ? (
        <ChevronDown className="size-4 shrink-0 text-[var(--text-tertiary)]" />
      ) : null}
    </div>
  );
}
