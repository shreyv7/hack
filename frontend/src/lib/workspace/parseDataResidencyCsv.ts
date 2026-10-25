import type { DataResidencyRow } from '@/types/workspace';

const CSV_TEMPLATE = `Data Category,Storage Region,Cross-border?,Legal Basis,Details
Consent records,Mumbai,No,Contract performance,
PII detected,Hyderabad,No,Legitimate use,
Aggregated analytics,Global,Yes,Anonymized only,No personal identifiers exported
`;

export function dataResidencyCsvTemplate(): string {
  return CSV_TEMPLATE;
}

function parseCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCrossBorder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0', ''].includes(v)) return false;
  throw new Error(`Invalid cross-border value "${value}" (use Yes/No)`);
}

function rowFromCells(cells: string[], map: Record<keyof DataResidencyRow, number>): DataResidencyRow | null {
  const category = (cells[map.category] ?? '').trim();
  if (!category) return null;

  const crossRaw = (cells[map.cross_border] ?? '').trim();
  let cross_border = false;
  if (crossRaw) {
    cross_border = parseCrossBorder(crossRaw);
  }

  return {
    category,
    region: (cells[map.region] ?? '').trim(),
    cross_border,
    legal_basis: (cells[map.legal_basis] ?? '').trim(),
    details: (cells[map.details] ?? '').trim(),
  };
}

export interface ParseDataResidencyCsvResult {
  rows: DataResidencyRow[];
  errors: string[];
  skipped: number;
}

/**
 * Parse a CSV file into data residency rows.
 * Expected columns: Data Category, Storage Region, Cross-border?, Legal Basis, Details (optional).
 */
export function parseDataResidencyCsv(text: string): ParseDataResidencyCsvResult {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const errors: string[] = [];
  if (lines.length === 0) {
    return { rows: [], errors: ['CSV file is empty'], skipped: 0 };
  }

  const firstCells = parseCsvRow(lines[0]);
  const headerLooksLikeData =
    firstCells.length >= 2 &&
    findColumnIndex(firstCells, ['data category', 'category']) < 0 &&
    findColumnIndex(firstCells, ['storage region', 'region']) < 0;

  let startLine = 0;
  let columnMap: Record<keyof DataResidencyRow, number>;

  if (headerLooksLikeData) {
    columnMap = {
      category: 0,
      region: 1,
      cross_border: 2,
      legal_basis: 3,
      details: 4,
    };
  } else {
    startLine = 1;
    const catIdx = findColumnIndex(firstCells, ['data category', 'category']);
    const regionIdx = findColumnIndex(firstCells, ['storage region', 'region']);
    const crossIdx = findColumnIndex(firstCells, ['cross border', 'cross-border', 'cross_border']);
    const legalIdx = findColumnIndex(firstCells, ['legal basis', 'legal_basis']);
    const detailsIdx = findColumnIndex(firstCells, ['details']);

    if (catIdx < 0) {
      return {
        rows: [],
        errors: ['Missing required column: Data Category (or category)'],
        skipped: 0,
      };
    }

    columnMap = {
      category: catIdx,
      region: regionIdx >= 0 ? regionIdx : -1,
      cross_border: crossIdx >= 0 ? crossIdx : -1,
      legal_basis: legalIdx >= 0 ? legalIdx : -1,
      details: detailsIdx >= 0 ? detailsIdx : -1,
    };
  }

  const rows: DataResidencyRow[] = [];
  let skipped = 0;

  for (let lineNo = startLine; lineNo < lines.length; lineNo += 1) {
    const cells = parseCsvRow(lines[lineNo]);
    if (cells.every((c) => !c.trim())) continue;

    try {
      const get = (idx: number) => (idx >= 0 ? cells[idx] ?? '' : '');
      const mapped: Record<keyof DataResidencyRow, number> = {
        category: columnMap.category,
        region: columnMap.region,
        cross_border: columnMap.cross_border,
        legal_basis: columnMap.legal_basis,
        details: columnMap.details,
      };
      const patchedCells = [
        get(mapped.category),
        get(mapped.region),
        get(mapped.cross_border),
        get(mapped.legal_basis),
        get(mapped.details),
      ];
      const row = rowFromCells(patchedCells, {
        category: 0,
        region: 1,
        cross_border: 2,
        legal_basis: 3,
        details: 4,
      });
      if (!row) {
        skipped += 1;
        errors.push(`Row ${lineNo + 1}: skipped — data category is empty`);
        continue;
      }
      rows.push(row);
    } catch (e) {
      skipped += 1;
      errors.push(`Row ${lineNo + 1}: ${e instanceof Error ? e.message : 'Invalid row'}`);
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('No valid data rows found in CSV');
  }

  return { rows, errors, skipped };
}

export function downloadDataResidencyTemplate(): void {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'data-residency-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
