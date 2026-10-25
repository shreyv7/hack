import type { ReactElement, ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { DPDPAReferenceTrigger } from '@/app/components/common/DPDPAReferenceHoverCard';
import { enrichSections, resolveSectionsForLabel } from '@/lib/dpdpaSectionCatalog';
import { openDPDPADocument, resolveDPDPAUrlFromLabel } from '@/lib/dpdpaReferences';
import { cn } from '@/lib/utils';

interface StatuteTextLinkProps {
  label: string;
  url?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Inline clickable statute citation with hover detail card.
 */
export function StatuteTextLink({ label, url, className, children }: StatuteTextLinkProps): ReactElement {
  const docUrl = url ?? resolveDPDPAUrlFromLabel(label);
  const display = children ?? label;
  const hoverSections = enrichSections(resolveSectionsForLabel(label));

  if (!docUrl) {
    return <span className={className}>{display}</span>;
  }

  const linkButton = (
    <button
      type="button"
      onClick={() => openDPDPADocument(docUrl)}
      className={cn(
        'group inline-flex items-center gap-0.5 text-inherit hover:text-indigo-700 hover:underline transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 rounded',
        className,
      )}
    >
      {display}
      <ExternalLink className="size-3 opacity-0 group-hover:opacity-70" strokeWidth={1.5} aria-hidden />
    </button>
  );

  if (hoverSections.length === 0) {
    return linkButton;
  }

  return <DPDPAReferenceTrigger sections={hoverSections}>{linkButton}</DPDPAReferenceTrigger>;
}

interface SectionReferenceProps {
  /** DPDPA section reference label (e.g. "Section 8(5)"). */
  section: string;
  /** Optional maximum penalty for the section, expressed in crore (₹). */
  penalty?: number;
  /** Optional explicit statute path on dpdpa.com. */
  url?: string;
  /** Additional class names merged onto the root element. */
  className?: string;
}

/**
 * Inline caption that cites a DPDPA section with hover card and link to dpdpa.com.
 */
export function SectionReference({ section, penalty, url, className }: SectionReferenceProps): ReactElement {
  const docUrl = url ?? resolveDPDPAUrlFromLabel(section);
  const hoverSections = enrichSections(resolveSectionsForLabel(section));

  const content = (
    <>
      {section}
      {penalty ? <span className="ml-2">— Max penalty ₹{penalty} Cr</span> : null}
      {docUrl ? (
        <ExternalLink className="ml-1.5 inline size-3 opacity-60 group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
      ) : null}
    </>
  );

  if (!docUrl) {
    return <div className={cn('text-xs text-gray-500', className)}>{content}</div>;
  }

  const referenceButton = (
    <button
      type="button"
      onClick={() => openDPDPADocument(docUrl)}
      className={cn(
        'group text-left text-xs text-gray-500 hover:text-indigo-700 transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded',
        className,
      )}
    >
      {content}
    </button>
  );

  if (hoverSections.length === 0) {
    return referenceButton;
  }

  return <DPDPAReferenceTrigger sections={hoverSections}>{referenceButton}</DPDPAReferenceTrigger>;
}
