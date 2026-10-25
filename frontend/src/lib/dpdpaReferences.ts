/** Official DPDPA 2023 statute host used by mapping chips and reference panels. */
export const DPDPA_DOC_ORIGIN = 'https://www.dpdpa.com';

export interface ParsedDPDPARef {
  chapter: number;
  section: number;
  subsection?: number | string;
}

/**
 * Relative path to a chapter/section HTML page on dpdpa.com.
 */
export function dpdpaSectionPath(chapter: number, section: number | string): string {
  return `/dpdpa2023/chapter-${chapter}/section${section}.html`;
}

/**
 * Absolute URL for a statute path or full URL.
 */
export function dpdpaDocumentUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${DPDPA_DOC_ORIGIN}${path}`;
}

/**
 * Open the statute page in a new tab (same behavior as {@link DPDPAChip}).
 */
export function openDPDPADocument(pathOrUrl: string): void {
  window.open(dpdpaDocumentUrl(pathOrUrl), '_blank', 'noopener,noreferrer');
}

function inferChapterFromSection(section: number, context: string): number {
  const chapterInLabel = context.match(/Ch\.(\d+)/i);
  if (chapterInLabel) {
    return Number(chapterInLabel[1]);
  }
  if (section >= 11 && section <= 15) {
    return 3;
  }
  if (section === 16) {
    return 4;
  }
  if (section === 27) {
    return 5;
  }
  if (section === 33) {
    return 7;
  }
  if (section <= 3) {
    return 1;
  }
  if (section <= 10) {
    return 2;
  }
  return 2;
}

/**
 * Parse labels such as `Ch.2 §6(7)`, `Ch.2 §5 Notice`, or `DPDPA Section 8(6)`.
 */
export function parseDPDPALabel(label: string): ParsedDPDPARef | null {
  const normalized = label.trim().replace(/\s*\+\d+\s*$/u, '').trim();

  const chipMatch = normalized.match(/Ch\.(\d+)\s*§\s*(\d+)(?:\(([a-z0-9]+)\))?/iu);
  if (chipMatch) {
    return {
      chapter: Number(chipMatch[1]),
      section: Number(chipMatch[2]),
      subsection: chipMatch[3],
    };
  }

  const sectionMatch = normalized.match(
    /(?:DPDPA\s+)?Section[s]?\s+(\d+)(?:\((\d+)\))?(?:\s*[,–-]\s*\d+)?/iu,
  );
  if (sectionMatch) {
    const section = Number(sectionMatch[1]);
    return {
      chapter: inferChapterFromSection(section, normalized),
      section,
      subsection: sectionMatch[2],
    };
  }

  const trailingSection = normalized.match(/Section\s+(\d+)(?:\((\d+)\))?/iu);
  if (trailingSection) {
    const section = Number(trailingSection[1]);
    return {
      chapter: inferChapterFromSection(section, normalized),
      section,
      subsection: trailingSection[2],
    };
  }

  return null;
}

/**
 * Resolve a display label to the dpdpa.com document URL, if parseable.
 */
export function resolveDPDPAUrlFromLabel(label: string): string | null {
  const parsed = parseDPDPALabel(label);
  if (!parsed) {
    return null;
  }
  return dpdpaDocumentUrl(dpdpaSectionPath(parsed.chapter, parsed.section));
}
