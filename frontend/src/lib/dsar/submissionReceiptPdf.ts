import { jsPDF } from 'jspdf';
import type { DataRightType } from '@/types/dsar';
import { RIGHT_TYPE_LABELS } from '@/types/dsar';

export interface SubmissionReceiptInput {
  trackingId: string;
  organizationName: string;
  rightType: DataRightType;
  requesterName: string;
  requesterEmail: string;
  submittedAt?: Date;
  dpoEmail?: string | null;
  dpoName?: string | null;
}

function slaSummary(rightType: DataRightType): string[] {
  switch (rightType) {
    case 'grievance':
      return [
        'Your grievance will be acknowledged within 24 hours (DPDPA Section 13).',
        'A final response is targeted within 30 days of verified receipt.',
      ];
    case 'withdraw_consent':
      return [
        'Consent withdrawal will be processed without undue delay (typically within 24 hours).',
      ];
    case 'nomination':
      return [
        'Your nomination request will be processed within 30 days of verified receipt (DPDPA Section 14).',
      ];
    case 'access':
      return [
        'A response to your access request will be provided within 30 days of verified receipt (DPDPA Section 11).',
      ];
    case 'correction':
    case 'erasure':
      return [
        `Your ${rightType === 'correction' ? 'correction' : 'erasure'} request will be processed within 30 days of verified receipt (DPDPA Section 12).`,
      ];
    default:
      return ['You will receive updates at the email address provided.'];
  }
}

function buildReportLines(input: SubmissionReceiptInput): string[] {
  const submitted = input.submittedAt ?? new Date();
  const rightLabel = RIGHT_TYPE_LABELS[input.rightType];
  const lines = [
    'Vajra — Data Rights Request Receipt',
    '',
    `Organization: ${input.organizationName}`,
    `Tracking ID: ${input.trackingId}`,
    `Right exercised: ${rightLabel}`,
    `Data Principal: ${input.requesterName}`,
    `Email: ${input.requesterEmail}`,
    `Verified & received: ${submitted.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`,
    '',
    'Status: Identity verified — your request is in the organization queue.',
    '',
    'What happens next',
    ...slaSummary(input.rightType),
    '',
    'Keep this tracking ID to check request status on the privacy portal.',
    'You may be asked to verify your email again when checking status.',
  ];
  if (input.dpoEmail) {
    lines.push(
      '',
      `Data Protection Officer: ${input.dpoName ?? 'DPO'} · ${input.dpoEmail}`
    );
  }
  lines.push(
    '',
    'This receipt is issued under the Digital Personal Data Protection Act, 2023 (India).',
    'Powered by Vajra.'
  );
  return lines;
}

export function submissionReceiptMessage(input: SubmissionReceiptInput): string {
  const parts = slaSummary(input.rightType);
  return `We have received your ${RIGHT_TYPE_LABELS[input.rightType].toLowerCase()} request. ${parts.join(' ')}`;
}

export function downloadSubmissionReceiptPdf(input: SubmissionReceiptInput): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const width = 182;
  const lines = buildReportLines(input);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Request receipt', margin, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  let y = 28;
  for (const line of lines) {
    if (!line) {
      y += 3;
      continue;
    }
    if (line.startsWith('Vajra') || line === 'What happens next') {
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setFont('helvetica', 'normal');
    }
    const wrapped = doc.splitTextToSize(line, width) as string[];
    for (const segment of wrapped) {
      if (y > 280) {
        doc.addPage();
        y = margin;
      }
      doc.text(segment, margin, y);
      y += 5;
    }
  }

  const slug = input.organizationName.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const filename = `dpdpa-request-${input.trackingId}-${slug}.pdf`;
  doc.save(filename);
  return filename;
}
