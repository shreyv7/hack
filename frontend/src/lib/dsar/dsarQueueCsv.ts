import { RIGHT_TYPE_LABELS, STATUS_LABELS } from '@/types/dsar';
import type { DataRightsRequest } from '@/types/dsar';

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN');
}

function formatPhoneForCsv(phone: string): string {
  const v = phone.trim();
  // Excel often coerces digit-only phone numbers into scientific notation.
  // Prefixing with an apostrophe forces "text" interpretation.
  if (/^\+?\d{8,}$/.test(v)) return `'${v}`;
  return v;
}

export function queueStatusLabel(req: DataRightsRequest): string {
  if (req.status === 'completed' && req.closure_text) {
    return 'Closure PDF available';
  }
  if (req.sla_bucket === 'ack_breached') {
    return 'Ack overdue (S.13)';
  }
  if (
    req.right_type === 'grievance' &&
    req.ack_hours_remaining != null &&
    !req.acknowledged_at
  ) {
    return `${req.ack_hours_remaining}h to acknowledge`;
  }
  if (req.days_remaining != null) {
    return `${req.days_remaining}d remaining`;
  }
  return STATUS_LABELS[req.status];
}

export function grievanceAckLabel(req: DataRightsRequest): string {
  if (req.right_type !== 'grievance') return '';
  if (req.acknowledged_at) {
    return `Acknowledged ${formatDate(req.acknowledged_at)}`;
  }
  if (req.ack_due_at) {
    return `Due by ${formatDate(req.ack_due_at)}`;
  }
  return '';
}

const CSV_HEADERS = [
  'Tracking ID',
  'Requester Name',
  'Requester Email',
  'Requester Phone',
  'Right',
  'Status',
  'SLA Status',
  'SLA Started',
  'Response Due',
  'Grievance Ack',
  'Days Remaining',
  'Handler',
  'Request Details',
] as const;

function rowToCsvCells(req: DataRightsRequest, handlerNames: Record<string, string>): string[] {
  return [
    req.tracking_id,
    req.requester_name,
    req.requester_email ?? '',
    formatPhoneForCsv(req.requester_phone ?? ''),
    RIGHT_TYPE_LABELS[req.right_type],
    STATUS_LABELS[req.status],
    queueStatusLabel(req),
    formatDate(req.received_at),
    formatDate(req.due_at),
    grievanceAckLabel(req),
    req.days_remaining != null ? String(req.days_remaining) : '',
    req.assigned_to_user_id ? (handlerNames[req.assigned_to_user_id] ?? 'Assigned') : '',
    req.request_details,
  ];
}

export function buildDsarQueueCsv(
  requests: DataRightsRequest[],
  handlerNames: Record<string, string>,
): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const req of requests) {
    lines.push(rowToCsvCells(req, handlerNames).map(escapeCsvCell).join(','));
  }
  return lines.join('\r\n');
}

export function downloadDsarQueueCsv(
  requests: DataRightsRequest[],
  handlerNames: Record<string, string>,
  statusSlug: string,
): string {
  const csv = buildDsarQueueCsv(requests, handlerNames);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  const filename = `dsar-${statusSlug}-${date}.csv`;
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return filename;
}
