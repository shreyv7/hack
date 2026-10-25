import type { BreachIncident } from '@/types/compliance';
import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';

export function downloadBreachDisclosurePdf(incident: BreachIncident, orgName: string): string {
  const pdf = new CompliancePdf('Breach Disclosure Package');
  const d = incident.wizard_data;
  pdf.line(`Organization: ${orgName}`);
  pdf.line(`Incident: ${incident.incident_ref} | Severity: ${incident.severity}`);
  pdf.line(`DPDPA Section 8(6) — 72-hour notification`);
  pdf.line(`Discovered: ${new Date(incident.discovered_at).toLocaleString('en-IN')}`);
  pdf.line(`Deadline: ${new Date(incident.deadline_at).toLocaleString('en-IN')}`);
  pdf.subheading('Impact assessment');
  pdf.line(`Affected principals: ${d.affected_count ?? '—'}`);
  pdf.line(`Special categories: ${(d.special_categories ?? []).join(', ') || '—'}`);
  pdf.line(`Data types: ${(d.data_types ?? []).join(', ') || '—'}`);
  pdf.line(`Mitigation: ${d.mitigation_actions ?? '—'}`);
  pdf.subheading('DPB notification');
  pdf.line(`Board: ${d.dpb_board ?? '—'} | Method: ${d.dpb_method ?? '—'}`);
  pdf.line(`Summary: ${d.incident_summary ?? '—'}`);
  pdf.line(`Remediation: ${d.remediation_steps ?? '—'}`);
  pdf.subheading('Data principal notification');
  pdf.line(`Channels: ${(d.dp_channels ?? ['email']).join(', ')}`);
  pdf.line(`Subject: ${d.dp_email_subject ?? '—'}`);
  pdf.line(`Message: ${d.dp_message_body ?? '—'}`);
  pdf.subheading('Public disclosure');
  pdf.line(`Required: ${d.public_disclosure_required ? 'Yes' : 'No'}`);
  pdf.line(`Statement: ${d.public_statement ?? '—'}`);
  return pdf.save(`breach-disclosure-${incident.incident_ref}.pdf`);
}
