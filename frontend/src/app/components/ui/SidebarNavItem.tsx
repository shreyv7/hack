import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  /** Navigation item label. */
  label: string;
  /** Highlights the item as the current route. */
  active?: boolean;
  /** Optional numeric badge count. Hidden when sidebar is collapsed. */
  badge?: number;
  /** When true, shows only the first letter of the label. */
  collapsed?: boolean;
}

/**
 * Sidebar navigation row with optional badge and collapsed mode.
 */
export function SidebarNavItem({
  label,
  active,
  badge,
  collapsed,
}: SidebarNavItemProps): ReactElement {
  return (
    <div
      className={cn(
        'flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer',
        active
          ? 'bg-[var(--brand-primary)] text-white'
          : 'bg-transparent text-white/60',
      )}
    >
      <span className={collapsed ? 'text-center w-full' : undefined}>{collapsed ? label[0] : label}</span>
      {badge && !collapsed ? (
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-semibold text-white',
            active ? 'bg-white/20' : 'bg-[var(--brand-primary)]',
          )}
        >
          {badge}
        </span>
      ) : null}
    </div>
  );
}
