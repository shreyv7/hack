import { jsPDF } from 'jspdf';
import type { NoticeSummary, Purpose } from '@/types/consent';

export type ConsentEvidenceSection = 'consent-notices' | 'purpose-registry';

export const CONSENT_SECTION_TITLES: Record<ConsentEvidenceSection, string> = {
  'consent-notices': 'Consent Notices',
  'purpose-registry': 'Purpose Registry',
};

const MARGIN = 14;
const PAGE_BOTTOM = 283;
const CONTENT_WIDTH = 182;

export interface ConsentEvidenceExportContext {
  organizationName: string;
  exporterEmail?: string;
  exporterRole?: string;
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  return String(value);
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function slugify(text: string): string {
  return text.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'org';
}

class PdfDocument {
  private doc: jsPDF;
  private y = MARGIN;

  constructor() {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4' });
  }

  private ensureSpace(mm: number): void {
    if (this.y + mm > PAGE_BOTTOM) {
      this.doc.addPage();
      this.y = MARGIN;
    }
  }

  title(text: string): void {
    this.ensureSpace(14);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(16);
    this.doc.setTextColor(79, 70, 229);
    this.doc.text(text, MARGIN, this.y);
    this.y += 10;
    this.doc.setTextColor(0, 0, 0);
  }

  heading(text: string): void {
    this.ensureSpace(10);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12);
    this.doc.text(text, MARGIN, this.y);
    this.y += 8;
  }

  subheading(text: string): void {
    this.ensureSpace(8);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.doc.text(text, MARGIN, this.y);
    this.y += 6;
  }

  paragraph(text: string): void {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      this.ensureSpace(6);
      this.doc.text(line, MARGIN, this.y);
      this.y += 5;
    }
    this.y += 2;
  }

  field(label: string, value: unknown): void {
    const text = display(value);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.ensureSpace(6);
    this.doc.text(label, MARGIN, this.y);
    this.y += 4;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      this.ensureSpace(5);
      this.doc.text(line, MARGIN + 2, this.y);
      this.y += 5;
    }
    this.y += 2;
  }

  divider(): void {
    this.y += 2;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);
    this.y += 6;
  }

  newPage(): void {
    this.doc.addPage();
    this.y = MARGIN;
  }

  save(filename: string): void {
    this.doc.save(filename);
  }
}

function renderCover(
  pdf: PdfDocument,
  sectionTitle: string,
  context: ConsentEvidenceExportContext,
  exportedAt: string,
  summary: string
): void {
  pdf.title('DPDPA Shield — Evidence Pack');
  pdf.heading(sectionTitle);
  pdf.paragraph(summary);
  pdf.field('Organization', context.organizationName);
  pdf.field('Exported at', new Date(exportedAt).toLocaleString('en-IN'));
  if (context.exporterEmail) pdf.field('Exported by', context.exporterEmail);
  if (context.exporterRole) pdf.field('Role', formatRole(context.exporterRole));
  pdf.divider();
}

function renderNotices(pdf: PdfDocument, notices: NoticeSummary[]): void {
  pdf.heading('Consent Notices Register');
  pdf.field('Total notices', notices.length);

  if (notices.length === 0) {
    pdf.paragraph('No consent notices recorded.');
    return;
  }

  notices.forEach((notice, index) => {
    pdf.subheading(`${index + 1}. ${notice.display_name ?? notice.internal_name}`);
    pdf.field('Internal name', notice.internal_name);
    pdf.field('Version', notice.version_label);
    pdf.field('Status', notice.status);
    pdf.field('Linked purposes', notice.purposes_count);
    pdf.field('Compliance warnings', notice.warnings_count);
    pdf.field(
      'Active since',
      notice.active_since ? new Date(notice.active_since).toLocaleString('en-IN') : '—'
    );
    pdf.field('Has draft version', notice.has_draft ? 'Yes' : 'No');
    pdf.divider();
  });
}

function renderPurposes(pdf: PdfDocument, purposes: Purpose[]): void {
  pdf.heading('Purpose Registry');
  pdf.field('Total purposes', purposes.length);

  if (purposes.length === 0) {
    pdf.paragraph('No processing purposes recorded.');
    return;
  }

  purposes.forEach((purpose, index) => {
    pdf.subheading(`${index + 1}. ${purpose.name}`);
    pdf.field(
      'Legal basis',
      purpose.legal_basis === 'legitimate_use' ? 'Legitimate use' : 'Consent'
    );
    pdf.field('Data categories', purpose.data_categories);
    pdf.field('Retention period', purpose.retention_period);
    pdf.field('Special category', purpose.is_special_category);
    pdf.field('Linked notices', purpose.linked_notices_count);
    pdf.field(
      'Last reviewed',
      purpose.last_reviewed_at
        ? new Date(purpose.last_reviewed_at).toLocaleDateString('en-IN')
        : '—'
    );
    pdf.divider();
  });
}

export function downloadConsentNoticesEvidencePdf(
  notices: NoticeSummary[],
  context: ConsentEvidenceExportContext
): string {
  const exportedAt = new Date().toISOString();
  const slug = slugify(context.organizationName);
  const filename = `dpdpa-evidence-consent-notices-${slug}-${exportedAt.slice(0, 10)}.pdf`;

  const pdf = new PdfDocument();
  renderCover(
    pdf,
    CONSENT_SECTION_TITLES['consent-notices'],
    context,
    exportedAt,
    'Consent notice register for DPDPA Section 5 and Section 6 compliance evidence.'
  );
  renderNotices(pdf, notices);
  pdf.paragraph(
    'This PDF was generated from DPDPA Shield consent management records for audit and compliance evidence purposes.'
  );
  pdf.save(filename);
  return filename;
}

export function downloadPurposeRegistryEvidencePdf(
  purposes: Purpose[],
  context: ConsentEvidenceExportContext
): string {
  const exportedAt = new Date().toISOString();
  const slug = slugify(context.organizationName);
  const filename = `dpdpa-evidence-purpose-registry-${slug}-${exportedAt.slice(0, 10)}.pdf`;

  const pdf = new PdfDocument();
  renderCover(
    pdf,
    CONSENT_SECTION_TITLES['purpose-registry'],
    context,
    exportedAt,
    'Processing purpose registry for DPDPA Section 4 and Section 6 purpose limitation evidence.'
  );
  renderPurposes(pdf, purposes);
  pdf.paragraph(
    'This PDF was generated from DPDPA Shield consent management records for audit and compliance evidence purposes.'
  );
  pdf.save(filename);
  return filename;
}

export function downloadFullConsentEvidencePdf(
  notices: NoticeSummary[],
  purposes: Purpose[],
  context: ConsentEvidenceExportContext
): string {
  const exportedAt = new Date().toISOString();
  const slug = slugify(context.organizationName);
  const filename = `dpdpa-evidence-consent-management-full-${slug}-${exportedAt.slice(0, 10)}.pdf`;

  const pdf = new PdfDocument();
  renderCover(
    pdf,
    'Full Consent Management Evidence Pack',
    context,
    exportedAt,
    'Complete consent notices and purpose registry export for DPDPA consent management compliance.'
  );
  renderNotices(pdf, notices);
  pdf.newPage();
  renderPurposes(pdf, purposes);
  pdf.paragraph(
    'This PDF was generated from DPDPA Shield consent management records for audit and compliance evidence purposes.'
  );
  pdf.save(filename);
  return filename;
}
