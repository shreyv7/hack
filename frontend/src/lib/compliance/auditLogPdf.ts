import type { AuditEvent, AuditLogSummary, AuditVerifyResult } from '@/types/compliance';
import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';

export function downloadAuditEvidencePackPdf(
  events: AuditEvent[],
  summary: AuditLogSummary,
  verify: AuditVerifyResult | null,
  orgName: string
): string {
  const pdf = new CompliancePdf('Audit Log — Evidence Pack');
  pdf.line(`Organization: ${orgName} | DPDPA Section 8(5)`);
  pdf.line(`Entries: ${summary.entry_count} | Merkle root: ${summary.merkle_root.slice(0, 16)}…`);
  if (verify) {
    pdf.line(`Integrity: ${verify.integrity_ok ? 'VERIFIED' : 'FAILED'} at ${new Date(verify.verified_at).toLocaleString('en-IN')}`);
  }
  pdf.subheading('Event register');
  for (const e of events.slice(0, 100)) {
    pdf.line(
      `${new Date(e.time).toLocaleString('en-IN')} | ${e.actor} | ${e.type} | ${e.action}`,
      8
    );
    pdf.line(`  Hash: ${e.entry_hash.slice(0, 24)}…`, 8);
  }
  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return pdf.save(`audit-evidence-pack-${slug}.pdf`);
}

export function downloadAuditEventCertificatePdf(event: AuditEvent, orgName: string): string {
  const pdf = new CompliancePdf('Audit Event Certificate');
  pdf.line(`Organization: ${orgName}`);
  pdf.line(`Time: ${new Date(event.time).toLocaleString('en-IN')}`);
  pdf.line(`Actor: ${event.actor} (${event.role})`);
  pdf.line(`Action: ${event.action}`);
  pdf.line(`Details: ${event.details}`);
  pdf.line(`Type: ${event.type} | Severity: ${event.severity}`);
  pdf.line(`Entry hash: ${event.entry_hash}`);
  pdf.line(`Previous hash: ${event.prev_hash}`);
  return pdf.save(`audit-event-${event.id.slice(0, 8)}.pdf`);
}
