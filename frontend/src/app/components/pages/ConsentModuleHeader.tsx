import type { ReactElement, ReactNode } from 'react';
import { SectionReference } from '@/app/components/common/SectionReference';

interface ConsentModuleHeaderProps {
  title: string;
  sectionReference: string;
  chips: ReactNode;
  actions: ReactNode;
}

/**
 * Two-row consent module header: title + statutory refs on the left,
 * aligned action toolbar on the right.
 */
export function ConsentModuleHeader({
  title,
  sectionReference,
  chips,
  actions,
}: ConsentModuleHeaderProps): ReactElement {
  return (
    <div className="mb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="mb-1 text-[var(--text-primary)]">{title}</h1>
          <SectionReference section={sectionReference} />
          <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div>
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-start gap-2 lg:justify-end">
          {actions}
        </div>
      </div>
    </div>
  );
}
