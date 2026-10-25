import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';
import type { TabVariant } from '@/types';

interface TabProps {
  /** Visual style of the tab bar. */
  variant: TabVariant;
  /** Tab label strings. */
  tabs: string[];
  /** Zero-based index of the currently active tab. */
  activeTab: number;
}

/**
 * Tab bar with underline or pill visual variants.
 */
export function Tab({ variant, tabs, activeTab }: TabProps): ReactElement {
  if (variant === 'underline') {
    return (
      <div className="flex gap-6 border-b border-[var(--border-default)]">
        {tabs.map((tab, index) => {
          const isActive = index === activeTab;
          return (
            <button
              key={`${index}-${tab}`}
              type="button"
              className={cn(
                'pb-3 text-sm font-medium transition-colors relative',
                isActive ? 'text-[var(--brand-primary)]' : 'text-[var(--text-secondary)]',
              )}
            >
              {tab}
              {isActive ? (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--brand-primary)]" />
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex gap-1 p-1 rounded-lg bg-[var(--surface-raised)]">
      {tabs.map((tab, index) => {
        const isActive = index === activeTab;
        return (
          <button
            key={`${index}-${tab}`}
            type="button"
            className={cn(
              'px-4 py-1.5 text-sm font-medium rounded-md transition-all',
              isActive
                ? 'bg-[var(--surface-card)] text-[var(--text-primary)] shadow-sm'
                : 'bg-transparent text-[var(--text-secondary)]',
            )}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
