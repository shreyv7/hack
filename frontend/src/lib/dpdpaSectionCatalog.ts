import { dpdpaSectionPath, parseDPDPALabel } from '@/lib/dpdpaReferences';

export interface DPDPASection {
  chapter: number;
  section: number | string;
  subsection?: number | string;
  name?: string;
  url: string;
  excerpt?: string;
}

interface CatalogEntry {
  name: string;
  excerpt?: string;
}

const CATALOG: Record<string, CatalogEntry> = {
  '1-2': {
    name: 'Definitions',
    excerpt: 'Personal data means any data about an individual who is identifiable by or in relation to such data.',
  },
  '2-4': { name: 'Grounds for processing personal data', excerpt: 'A person may process personal data only in accordance with the provisions of this Act.' },
  '2-5': { name: 'Notice', excerpt: 'Notice shall be given in clear and plain language, describing the personal data and the purpose of processing.' },
  '2-6': { name: 'Consent', excerpt: 'Consent shall be free, specific, informed, unconditional and unambiguous with a clear affirmative action.' },
  '2-7': { name: 'Certain legitimate uses', excerpt: 'Personal data may be processed for certain legitimate uses without consent as specified.' },
  '2-8': { name: 'General obligations of data fiduciary', excerpt: 'A data fiduciary shall make reasonable efforts to ensure personal data processed is accurate and complete.' },
  '2-9': { name: "Processing of children's personal data", excerpt: 'Verifiable parental consent is required before processing personal data of a child.' },
  '2-10': { name: 'Additional obligations of Significant Data Fiduciary', excerpt: 'SDFs must appoint a DPO, engage an independent auditor, and conduct DPIAs.' },
  '3-11': { name: 'Right to access', excerpt: 'The data principal has the right to obtain a summary of personal data being processed and processing activities.' },
  '3-12': { name: 'Right to correction and erasure', excerpt: 'The data principal may request correction, completion, updating and erasure of personal data.' },
  '3-13': { name: 'Right of grievance redressal', excerpt: 'The data principal may register a grievance with the data fiduciary or Consent Manager.' },
  '3-14': { name: 'Right to nominate', excerpt: 'The data principal may nominate another individual to exercise rights in the event of death or incapacity.' },
  '3-15': { name: 'Duties of data principal', excerpt: 'A data principal shall not register a false grievance or suppress material information.' },
  '4-16': { name: 'Processing of personal data outside India', excerpt: 'The Central Government may restrict transfer of personal data to notified countries or territories.' },
  '5-27': { name: 'Powers of Board', excerpt: 'The Data Protection Board may inquire into personal data breaches and impose penalties.' },
  '7-33': { name: 'Penalties', excerpt: 'Penalties may be imposed up to ₹250 crore for failure to take reasonable security safeguards.' },
};

const SUBSECTION_NAMES: Record<string, string> = {
  '2-6-1': 'Free, specific and informed consent',
  '2-6-3': 'Withdrawal of consent',
  '2-6-4': 'Right to withdraw consent',
  '2-6-7': 'Consent through Consent Manager',
  '2-8-4': 'Accuracy & verifiability',
  '2-8-5': 'Reasonable security safeguards',
  '2-8-6': 'Breach intimation',
  '2-8-7': 'Erasure after purpose served',
  '2-9-1': 'Verifiable parental consent',
  '2-9-2': 'Prohibition on tracking or behavioural monitoring of children',
  '2-10-2': 'Significant Data Fiduciary obligations',
};

/** Related sections implied by a `+N` suffix on chip labels. */
const RELATED_SECTION_KEYS: Record<string, string[]> = {
  '2-5': ['2-6'],
  '2-6': ['2-5'],
};

function catalogKey(chapter: number, section: number | string, subsection?: number | string): string {
  return subsection !== undefined ? `${chapter}-${section}-${subsection}` : `${chapter}-${section}`;
}

function extractTitleFromLabel(label: string): string | undefined {
  const emDash = label.match(/(?:—|-)\s*(.+)$/u)?.[1]?.trim();
  if (emDash) {
    return emDash;
  }
  const afterParen = label.match(/\)\s+([A-Za-z][\w\s&]+)$/u)?.[1]?.trim();
  if (afterParen) {
    return afterParen;
  }
  const afterSection = label.match(/§\d+(?:\([^)]+\))?\s+([A-Za-z][\w\s&]+)$/u)?.[1]?.trim();
  return afterSection;
}

function buildSection(
  chapter: number,
  section: number,
  subsection?: number | string,
  labelTitle?: string,
): DPDPASection {
  const baseKey = `${chapter}-${section}`;
  const subKey = catalogKey(chapter, section, subsection);
  const cat = CATALOG[baseKey];
  const name = labelTitle ?? SUBSECTION_NAMES[subKey] ?? cat?.name ?? `Chapter ${chapter}, Section ${section}`;

  return {
    chapter,
    section,
    subsection,
    name,
    url: dpdpaSectionPath(chapter, section),
    excerpt: cat?.excerpt,
  };
}

function parseRelatedKey(key: string): { chapter: number; section: number } {
  const [chapter, section] = key.split('-').map(Number);
  return { chapter, section };
}

/**
 * Build statute section metadata for hover cards from a display label.
 */
export function resolveSectionsForLabel(label: string): DPDPASection[] {
  const trimmed = label.trim();
  const extraMatch = trimmed.match(/\+\s*(\d+)\s*$/u);
  const extraCount = extraMatch ? Number(extraMatch[1]) : 0;
  const withoutExtra = trimmed.replace(/\s*\+\d+\s*$/u, '').trim();
  const title = extractTitleFromLabel(withoutExtra);
  const parsed = parseDPDPALabel(withoutExtra);

  if (!parsed) {
    return [];
  }

  const primary = buildSection(parsed.chapter, parsed.section, parsed.subsection, title);
  const sections: DPDPASection[] = [primary];

  if (extraCount > 0) {
    const relatedKeys = RELATED_SECTION_KEYS[`${parsed.chapter}-${parsed.section}`] ?? [];
    const additions = relatedKeys
      .filter((key) => key !== `${parsed.chapter}-${parsed.section}`)
      .slice(0, extraCount);

    for (const key of additions) {
      const { chapter, section } = parseRelatedKey(key);
      sections.push(buildSection(chapter, section));
    }
  }

  return sections;
}

/**
 * Merge explicit section props with label-derived metadata (names/excerpts).
 */
export function enrichSections(sections: DPDPASection[]): DPDPASection[] {
  return sections.map((section) => {
    const baseKey = `${section.chapter}-${section.section}`;
    const subKey = catalogKey(section.chapter, section.section, section.subsection);
    const cat = CATALOG[baseKey];
    return {
      ...section,
      name: section.name ?? SUBSECTION_NAMES[subKey] ?? cat?.name,
      excerpt: section.excerpt ?? cat?.excerpt,
      url: section.url || dpdpaSectionPath(section.chapter, section.section),
    };
  });
}
