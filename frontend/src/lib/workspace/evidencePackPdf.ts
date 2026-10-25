import { jsPDF } from 'jspdf';
import type { EvidencePackSection } from '@/lib/workspace/evidencePack';
import { ALL_EVIDENCE_PACK_SECTIONS, SECTION_TITLES } from '@/lib/workspace/evidencePack';
import type { DataProcessor, DataResidencyRow, DpdpObligation, WorkspaceSettings } from '@/types/workspace';

const MARGIN = 14;
const PAGE_BOTTOM = 283;
const CONTENT_WIDTH = 182;

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function formatRole(role: string): string {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
  section: EvidencePackSection,
  settings: WorkspaceSettings,
  exportedAt: string,
  exporterEmail?: string,
  exporterRole?: string
): void {
  pdf.title('DPDPA Shield — Evidence Pack');
  pdf.heading(SECTION_TITLES[section]);
  pdf.field('Organization', settings.organization.name);
  pdf.field('Organization slug', settings.organization.slug);
  pdf.field('Exported at', new Date(exportedAt).toLocaleString('en-IN'));
  if (exporterEmail) pdf.field('Exported by', exporterEmail);
  if (exporterRole) pdf.field('Role', formatRole(exporterRole));
  pdf.divider();
}

function renderProfile(pdf: PdfDocument, settings: WorkspaceSettings): void {
  pdf.heading('Organization profile');
  pdf.field('Registered address', settings.registered_address);
  pdf.field('Headquarters', settings.headquarters);
  pdf.field('India presence', settings.india_presence);
  pdf.field('Solution description', settings.solution_description);
  pdf.field('Logo URL', settings.logo_url);
  pdf.divider();
  pdf.heading('Data Protection Officer');
  pdf.field('Name', settings.dpo_name);
  pdf.field('Email', settings.dpo_email);
  pdf.field('Phone', settings.dpo_phone);
  pdf.divider();
  pdf.heading('Compliance & adoption');
  pdf.field('Compliance version', settings.compliance_version);
  pdf.field('Changelog summary', settings.changelog_summary);
  pdf.field('Self-attested at', settings.self_attested_at);
  pdf.field('Third-party audit firm', settings.third_party_audit_firm);
  pdf.field('Audit valid until', settings.audit_valid_until);
}

function renderIndustry(pdf: PdfDocument, settings: WorkspaceSettings): void {
  pdf.heading('Industry configuration');
  pdf.field('Primary industry', settings.primary_industry);
  pdf.field('Secondary industries', settings.secondary_industries);
  pdf.field('Significant Data Fiduciary', settings.is_significant_data_fiduciary);
  pdf.field('Data principals count band', settings.data_principals_count_band);
  pdf.field('Annual turnover band', settings.annual_turnover_band);
}

function renderDeployment(pdf: PdfDocument, settings: WorkspaceSettings): void {
  pdf.heading('Deployment');
  pdf.field('Deployment model', formatRole(settings.deployment_model));
  pdf.field('Primary region', settings.primary_region);
  pdf.field('Backup region', settings.backup_region);
  pdf.field('Allowed regions', settings.allowed_regions);
  pdf.divider();
  pdf.heading('Data residency');
  const rows = settings.data_residency ?? [];
  if (rows.length === 0) {
    pdf.paragraph('No residency rows configured.');
    return;
  }
  for (const row of rows as DataResidencyRow[]) {
    pdf.subheading(row.category || 'Category');
    pdf.field('Storage region', row.region);
    pdf.field('Cross-border', row.cross_border);
    pdf.field('Legal basis', row.legal_basis);
    if (row.details) pdf.field('Details', row.details);
    pdf.divider();
  }
}

function renderProcessors(pdf: PdfDocument, processors: DataProcessor[]): void {
  pdf.heading('Data processors');
  if (processors.length === 0) {
    pdf.paragraph('No processors registered.');
    return;
  }
  processors.forEach((p, i) => {
    pdf.subheading(`${i + 1}. ${p.name}`);
    pdf.field('Role', p.processor_role);
    pdf.field('Purpose', p.purpose);
    pdf.field('DPA status', p.dpa_status);
    pdf.field('DPA signed date', p.dpa_signed_date);
    pdf.field('Risk level', p.risk_level);
    pdf.field('Data categories', p.data_categories);
    pdf.field('Location', p.location);
    pdf.field('Contact email', p.contact_email);
    pdf.divider();
  });
}

function renderObligations(pdf: PdfDocument, obligations: DpdpObligation[]): void {
  pdf.heading('DPDP role comparison matrix');
  if (obligations.length === 0) {
    pdf.paragraph('Obligation catalog not loaded.');
    return;
  }
  for (const o of obligations) {
    pdf.subheading(o.obligation);
    pdf.field('Description', o.description);
    pdf.field('Statute reference', o.statute_reference);
    pdf.field('Data Fiduciary', o.df);
    pdf.field('Data Processor', o.dp);
    pdf.field('Significant Data Fiduciary', o.sdf);
    pdf.divider();
  }
}

function renderRoleMapping(
  pdf: PdfDocument,
  settings: WorkspaceSettings,
  obligations: DpdpObligation[]
): void {
  pdf.heading('DPDP role');
  pdf.field('Current role', formatRole(settings.dpdp_role));
  pdf.field('Role assessed at', settings.role_assessed_at);
  pdf.field('Role assessment', settings.role_assessment);
  pdf.field('SDF flag', settings.is_significant_data_fiduciary);
  pdf.field('Data principals band', settings.data_principals_count_band);
  pdf.field('Annual turnover band', settings.annual_turnover_band);
  pdf.divider();
  renderProcessors(pdf, settings.processors);
  renderObligations(pdf, obligations);
}

function renderSectionBody(
  pdf: PdfDocument,
  section: EvidencePackSection,
  settings: WorkspaceSettings,
  obligations: DpdpObligation[]
): void {
  switch (section) {
    case 'profile':
      renderProfile(pdf, settings);
      break;
    case 'industry':
      renderIndustry(pdf, settings);
      break;
    case 'deployment':
      renderDeployment(pdf, settings);
      break;
    case 'role-mapping':
      renderRoleMapping(pdf, settings, obligations);
      break;
  }
}

export function downloadEvidencePackPdf(
  section: EvidencePackSection,
  settings: WorkspaceSettings,
  obligations: DpdpObligation[],
  options: { exporterEmail?: string; exporterRole?: string }
): string {
  const exportedAt = new Date().toISOString();
  const slug = settings.organization.slug.replace(/[^a-z0-9-]/gi, '-');
  const filename = `dpdpa-evidence-${section}-${slug}-${exportedAt.slice(0, 10)}.pdf`;

  const pdf = new PdfDocument();
  renderCover(pdf, section, settings, exportedAt, options.exporterEmail, options.exporterRole);
  renderSectionBody(pdf, section, settings, obligations);
  pdf.paragraph(
    'This document was generated from DPDPA Shield workspace settings for audit and compliance evidence purposes.'
  );

  pdf.save(filename);
  return filename;
}

function renderFullCover(
  pdf: PdfDocument,
  settings: WorkspaceSettings,
  exportedAt: string,
  exporterEmail?: string,
  exporterRole?: string
): void {
  pdf.title('DPDPA Shield — Full Settings Evidence Pack');
  pdf.paragraph(
    'Complete workspace and compliance configuration across all Settings sections.'
  );
  pdf.field('Organization', settings.organization.name);
  pdf.field('Organization slug', settings.organization.slug);
  pdf.field('Exported at', new Date(exportedAt).toLocaleString('en-IN'));
  if (exporterEmail) pdf.field('Exported by', exporterEmail);
  if (exporterRole) pdf.field('Role', formatRole(exporterRole));
  pdf.divider();
}

export function downloadFullEvidencePackPdf(
  settings: WorkspaceSettings,
  obligations: DpdpObligation[],
  options: { exporterEmail?: string; exporterRole?: string }
): string {
  const exportedAt = new Date().toISOString();
  const slug = settings.organization.slug.replace(/[^a-z0-9-]/gi, '-');
  const filename = `dpdpa-evidence-full-settings-${slug}-${exportedAt.slice(0, 10)}.pdf`;

  const pdf = new PdfDocument();
  renderFullCover(pdf, settings, exportedAt, options.exporterEmail, options.exporterRole);

  ALL_EVIDENCE_PACK_SECTIONS.forEach((section, index) => {
    if (index > 0) {
      pdf.newPage();
    }
    pdf.heading(SECTION_TITLES[section]);
    renderSectionBody(pdf, section, settings, obligations);
    pdf.divider();
  });

  pdf.paragraph(
    'This document was generated from DPDPA Shield workspace settings for audit and compliance evidence purposes.'
  );

  pdf.save(filename);
  return filename;
}
