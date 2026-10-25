import type { ReactElement } from 'react';
import { ExternalLink, Scale } from 'lucide-react';
import { DPDPAReferenceTrigger } from '@/app/components/common/DPDPAReferenceHoverCard';
import type { DPDPASection } from '@/lib/dpdpaSectionCatalog';
import { enrichSections, resolveSectionsForLabel } from '@/lib/dpdpaSectionCatalog';
import { openDPDPADocument, resolveDPDPAUrlFromLabel } from '@/lib/dpdpaReferences';
import { cn } from '@/lib/utils';

export type { DPDPASection } from '@/lib/dpdpaSectionCatalog';

type ChipSize = 'inline' | 'compact' | 'detailed';

interface DPDPAChipProps {
  sections: DPDPASection | DPDPASection[];
  size?: ChipSize;
  className?: string;
}

const SIZE_STYLES: Record<
  ChipSize,
  { height: string; padding: string; fontSize: string; iconSize: number; externalIconSize: number }
> = {
  inline: { height: '22px', padding: '4px 8px', fontSize: '11px', iconSize: 12, externalIconSize: 10 },
  compact: { height: '18px', padding: '3px 6px', fontSize: '10px', iconSize: 0, externalIconSize: 0 },
  detailed: { height: '32px', padding: '6px 12px', fontSize: '12px', iconSize: 14, externalIconSize: 12 },
};

/**
 * Clickable chip linking to DPDPA section references with hover detail card.
 */
export function DPDPAChip({ sections, size = 'inline', className }: DPDPAChipProps): ReactElement {
  const sectionArray = enrichSections(Array.isArray(sections) ? sections : [sections]);
  const primary = sectionArray[0];
  const additionalCount = sectionArray.length - 1;
  const styles = SIZE_STYLES[size];

  const formatSectionLabel = (section: DPDPASection): string => {
    const subsectionText = section.subsection ? `(${section.subsection})` : '';
    if (size === 'detailed' && section.name) {
      return `Ch.${section.chapter} §${section.section}${subsectionText} — ${section.name}`;
    }
    return `Ch.${section.chapter} §${section.section}${subsectionText}`;
  };

  const handleClick = (): void => {
    openDPDPADocument(primary.url);
  };

  return (
    <DPDPAReferenceTrigger sections={sectionArray}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          'group rounded-full inline-flex items-center gap-1.5 transition-all hover:scale-105',
          'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
          'bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium tracking-wide',
          className,
        )}
        style={{ height: styles.height, padding: styles.padding, fontSize: styles.fontSize }}
      >
        {styles.iconSize > 0 ? (
          <Scale className="shrink-0 text-indigo-500" style={{ width: styles.iconSize, height: styles.iconSize }} strokeWidth={1.5} />
        ) : null}
        <span className="whitespace-nowrap">
          {formatSectionLabel(primary)}
          {additionalCount > 0 ? ` +${additionalCount}` : ''}
        </span>
        {styles.externalIconSize > 0 ? (
          <ExternalLink
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ width: styles.externalIconSize, height: styles.externalIconSize }}
            strokeWidth={1.5}
          />
        ) : null}
      </button>
    </DPDPAReferenceTrigger>
  );
}

interface DPDPALabelChipProps {
  text: string;
  /** Explicit statute path; overrides label parsing. */
  url?: string;
  /** Optional full section list for multi-section hover cards. */
  sections?: DPDPASection | DPDPASection[];
  className?: string;
}

/**
 * Clickable statutory reference label with hover detail card.
 */
export function DPDPALabelChip({ text, url, sections, className }: DPDPALabelChipProps): ReactElement {
  const resolvedSections = sections
    ? enrichSections(Array.isArray(sections) ? sections : [sections])
    : enrichSections(resolveSectionsForLabel(text));

  const href = url ?? resolveDPDPAUrlFromLabel(text);
  const isClickable = Boolean(href);
  const hoverSections = resolvedSections.length > 0 ? resolvedSections : [];

  const handleClick = (): void => {
    if (href) {
      openDPDPADocument(href);
    }
  };

  if (!isClickable) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold',
          'bg-[var(--status-info-bg)] text-[var(--status-info)]',
          className,
        )}
      >
        <Scale className="size-3" strokeWidth={1.5} />
        {text}
      </span>
    );
  }

  const chipButton = (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'group rounded-full inline-flex items-center gap-1.5 transition-all hover:scale-105',
        'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2',
        'bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium tracking-wide',
        'text-xs px-2 py-1',
        className,
      )}
    >
      <Scale className="size-3 shrink-0 text-indigo-500" strokeWidth={1.5} />
      <span className="whitespace-nowrap">{text}</span>
      <ExternalLink
        className="size-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500"
        strokeWidth={1.5}
      />
    </button>
  );

  if (hoverSections.length === 0) {
    return chipButton;
  }

  return <DPDPAReferenceTrigger sections={hoverSections}>{chipButton}</DPDPAReferenceTrigger>;
}
