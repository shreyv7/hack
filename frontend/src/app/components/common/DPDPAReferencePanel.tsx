import type { ReactElement } from 'react';
import { ExternalLink, Scale } from 'lucide-react';
import { DPDPAReferenceTrigger } from '@/app/components/common/DPDPAReferenceHoverCard';
import type { DPDPASection } from '@/lib/dpdpaSectionCatalog';
import { enrichSections, resolveSectionsForLabel } from '@/lib/dpdpaSectionCatalog';
import { dpdpaDocumentUrl, openDPDPADocument, resolveDPDPAUrlFromLabel } from '@/lib/dpdpaReferences';
import { cn } from '@/lib/utils';

export interface DPDPAReferenceItem {
  label: string;
  url?: string;
  sections?: DPDPASection | DPDPASection[];
}

export interface DPDPAReferencePanelProps {
  references: readonly (string | DPDPAReferenceItem)[];
  className?: string;
}

function resolveReferenceUrl(ref: string | DPDPAReferenceItem): string | null {
  if (typeof ref === 'string') {
    return resolveDPDPAUrlFromLabel(ref);
  }
  if (ref.url) {
    return dpdpaDocumentUrl(ref.url);
  }
  return resolveDPDPAUrlFromLabel(ref.label);
}

function referenceLabel(ref: string | DPDPAReferenceItem): string {
  return typeof ref === 'string' ? ref : ref.label;
}

function resolveHoverSections(ref: string | DPDPAReferenceItem): DPDPASection[] {
  if (typeof ref !== 'string' && ref.sections) {
    return enrichSections(Array.isArray(ref.sections) ? ref.sections : [ref.sections]);
  }
  return enrichSections(resolveSectionsForLabel(referenceLabel(ref)));
}

/**
 * DPDPA statute references shown below main page content (not a right rail).
 */
export function DPDPAReferencePanel({ references, className }: DPDPAReferencePanelProps): ReactElement {
  return (
    <section className={cn('mt-8', className)} aria-label="DPDPA Reference">
      <h3 className="font-semibold mb-4 text-sm text-[var(--text-primary)]">DPDPA Reference</h3>
      <div className="flex flex-col gap-2 items-start">
        {references.map((ref) => {
          const label = referenceLabel(ref);
          const docUrl = resolveReferenceUrl(ref);
          const hoverSections = resolveHoverSections(ref);
          const key = typeof ref === 'string' ? ref : ref.label;

          if (!docUrl) {
            return (
              <span
                key={key}
                className="text-left px-3 py-2 rounded-lg text-xs font-medium inline-flex items-center gap-2 bg-[var(--surface-raised)] text-[var(--text-primary)]"
              >
                <Scale className="w-3 h-3 text-indigo-500" strokeWidth={1.5} />
                {label}
              </span>
            );
          }

          const referenceButton = (
            <button
              type="button"
              onClick={() => openDPDPADocument(docUrl)}
              className="group text-left px-3 py-2 rounded-lg text-xs font-medium transition-all inline-flex items-center gap-2 hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 bg-indigo-50 border border-indigo-200 text-indigo-800"
            >
              <Scale className="w-3 h-3 shrink-0 text-indigo-500" strokeWidth={1.5} />
              {label}
              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" strokeWidth={1.5} />
            </button>
          );

          if (hoverSections.length === 0) {
            return <div key={key}>{referenceButton}</div>;
          }

          return (
            <DPDPAReferenceTrigger key={key} sections={hoverSections}>
              {referenceButton}
            </DPDPAReferenceTrigger>
          );
        })}
      </div>
    </section>
  );
}
