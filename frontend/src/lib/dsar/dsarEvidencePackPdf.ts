import { jsPDF } from 'jspdf';
import type { DataRightsRequest, DsarDashboard } from '@/types/dsar';
import { RIGHT_TYPE_LABELS, STATUS_LABELS } from '@/types/dsar';

const MARGIN = 14;
const PAGE_BOTTOM = 283;
const CONTENT_WIDTH = 182;
const REQUEST_LIMIT = 200;

export interface DsarEvidenceExportInput {
  organizationName: string;
  organizationSlug: string;
  dashboard: DsarDashboard;
  /** Rows included in the request register section */
  requests: DataRightsRequest[];
  filterLabel?: string;
  exporterEmail?: string;
  exporterRole?: string;
  handlerNames?: Record<string, string>;
}

function fmt(dt: string | null | undefined): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return dt;
  }
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
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

  field(label: string, value: unknown): void {
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(9);
    this.ensureSpace(6);
    this.doc.text(label, MARGIN, this.y);
    this.y += 4;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    const lines = this.doc.splitTextToSize(display(value), CONTENT_WIDTH) as string[];
    for (const line of lines) {
      this.ensureSpace(5);
      this.doc.text(line, MARGIN + 2, this.y);
      this.y += 5;
    }
    this.y += 2;
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

  divider(): void {
    this.y += 2;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.line(MARGIN, this.y, MARGIN + CONTENT_WIDTH, this.y);
    this.y += 6;
  }

  monoLine(text: string): void {
    this.doc.setFont('courier', 'normal');
    this.doc.setFontSize(8);
    const lines = this.doc.splitTextToSize(text, CONTENT_WIDTH) as string[];
    for (const line of lines) {
      this.ensureSpace(5);
      this.doc.text(line, MARGIN, this.y);
      this.y += 4;
    }
    this.doc.setFont('helvetica', 'normal');
    this.y += 2;
  }

  save(filename: string): void {
    this.doc.save(filename);
  }
}

/** Client-side PDF only — uses data already loaded on the DSAR tracker dashboard. */
export function downloadDsarEvidencePackPdf(input: DsarEvidenceExportInput): string {
  const { organizationName, organizationSlug, dashboard, requests } = input;
  const { metrics, matrix, breached_requests } = dashboard;

  const exportedAt = new Date().toISOString();
  const truncated = requests.length > REQUEST_LIMIT;
  const rows = requests.slice(0, REQUEST_LIMIT);

  const pdf = new PdfDocument();

  pdf.title('DPDPA Shield — DSAR Evidence Pack');
  pdf.paragraph(
    'Data Principal rights compliance export under the Digital Personal Data Protection Act, 2023 (Sections 11–14).'
  );
  pdf.field('Organization', organizationName);
  pdf.field('Organization slug', organizationSlug);
  pdf.field('Exported at', fmt(exportedAt));
  if (input.exporterEmail) pdf.field('Exported by', input.exporterEmail);
  if (input.exporterRole) pdf.field('Exporter role', input.exporterRole);
  if (input.filterLabel) pdf.field('Export scope', input.filterLabel);
  if (truncated) {
    pdf.paragraph(`Showing ${REQUEST_LIMIT} of ${requests.length} requests in this export.`);
  }
  pdf.divider();

  pdf.heading('SLA health summary');
  pdf.field('On track', metrics.on_track);
  pdf.field('Due within 24 hours', metrics.due_24h);
  pdf.field('Due within 7 days', metrics.due_7d);
  pdf.field('Response SLA breached', metrics.breached);
  pdf.field('Grievance acknowledgement overdue', metrics.ack_overdue);
  pdf.field('Awaiting email verification', metrics.pending_verification);
  pdf.field('Total active (in SLA)', metrics.total_active);
  pdf.divider();

  pdf.heading('SLA performance by right type');
  for (const row of matrix) {
    if (row.total === 0) continue;
    pdf.monoLine(
      `${RIGHT_TYPE_LABELS[row.right_type]} | SLA: ${row.sla_label ?? row.sla_days + 'd'} | ` +
        `Avg: ${row.avg_response_days ?? '—'}d | Success: ${row.success_rate ?? '—'}% | Breaches: ${row.breaches} | Total: ${row.total}`
    );
  }
  pdf.divider();

  pdf.heading('Request register');
  if (rows.length === 0) {
    pdf.paragraph('No requests in this export scope.');
  } else {
    for (const req of rows) {
      const handler =
        req.assigned_to_user_id && input.handlerNames?.[req.assigned_to_user_id]
          ? input.handlerNames[req.assigned_to_user_id]
          : req.assigned_to_user_id
            ? 'Assigned'
            : 'Unassigned';
      pdf.monoLine(
        [
          `${req.tracking_id} | ${RIGHT_TYPE_LABELS[req.right_type]} | ${STATUS_LABELS[req.status]}`,
          `Submitted: ${fmt(req.created_at)} | SLA start: ${fmt(req.received_at)} | Due: ${fmt(req.due_at)}`,
          `Handler: ${handler} | Breach: ${req.breached_at ? fmt(req.breached_at) : req.ack_breached_at ? 'Ack ' + fmt(req.ack_breached_at) : '—'}`,
          req.right_type === 'grievance'
            ? `Grievance ack: ${req.acknowledged_at ? fmt(req.acknowledged_at) : 'Pending (due ' + fmt(req.ack_due_at) + ')'}`
            : null,
          `Requester: ${req.requester_name} <${req.requester_email ?? req.requester_phone ?? '—'}>`,
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
  }
  pdf.divider();

  pdf.heading('SLA breaches requiring action');
  if (breached_requests.length === 0) {
    pdf.paragraph('No SLA breaches in the current dashboard view.');
  } else {
    for (const req of breached_requests) {
      pdf.monoLine(
        `${req.tracking_id} | ${RIGHT_TYPE_LABELS[req.right_type]} | ${req.requester_name} | ` +
          `Response: ${fmt(req.breached_at)} | Ack: ${fmt(req.ack_breached_at)}`
      );
    }
  }

  pdf.divider();
  pdf.paragraph(
    'Generated from the DSAR SLA Tracker dashboard. For internal compliance and audit use.'
  );

  const slug = organizationSlug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const date = exportedAt.slice(0, 10);
  const filename = `dsar-evidence-pack-${slug}-${date}.pdf`;
  pdf.save(filename);
  return filename;
}
