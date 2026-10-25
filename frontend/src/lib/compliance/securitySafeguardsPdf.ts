import type { SecuritySafeguardsData } from '@/types/compliance';
import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';

export function downloadSecurityEvidencePackPdf(data: SecuritySafeguardsData, orgName: string): string {
  const pdf = new CompliancePdf('Security Safeguards — Evidence Pack');
  pdf.line(`Organization: ${orgName} | DPDPA Section 8(5) / Rule 6`);
  pdf.line(`Score: ${data.summary.score}% (${data.summary.score_label}) | Documented: ${data.summary.documented_count}/${data.summary.total_controls}`);
  pdf.line(`Penalty: ₹${data.summary.penalty_current_crores} Cr current · ₹${data.summary.penalty_mitigated_crores} Cr mitigated · ₹${data.summary.penalty_worst_crores} Cr worst case`);
  pdf.subheading('Controls');
  for (const c of data.controls) {
    pdf.line(`${c.name} — ${c.status} (${c.items_completed}/${c.items_total})`);
    if (c.evidence) pdf.line(`  Evidence: ${c.evidence}`, 9);
  }
  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return pdf.save(`security-evidence-pack-${slug}.pdf`);
}

export function downloadSecurityAuditorReportPdf(data: SecuritySafeguardsData, orgName: string): string {
  const pdf = new CompliancePdf('Security Safeguards — Auditor Report');
  pdf.line(`Organization: ${orgName}`);
  pdf.line(`Compliance score: ${data.summary.score}% (${data.summary.score_label})`);
  pdf.line(`Penalty exposure: ₹${data.summary.penalty_current_crores} Cr (mitigated: ₹${data.summary.penalty_mitigated_crores} Cr · worst: ₹${data.summary.penalty_worst_crores} Cr)`);
  if (data.posture) {
    pdf.subheading('Real-time security posture');
    pdf.line(`Failed logins (24h): ${data.posture.failed_logins_24h.value} — ${data.posture.failed_logins_24h.status_label}`);
    pdf.line(`Unencrypted PII fields: ${data.posture.unencrypted_assets.value} — ${data.posture.unencrypted_assets.status_label}`);
    pdf.line(`MFA bypass users: ${data.posture.mfa_bypass_users.value} — ${data.posture.mfa_bypass_users.status_label}`);
    pdf.line(`Anomalies: ${data.posture.anomalies.value} — ${data.posture.anomalies.status_label}`);
  }
  pdf.subheading('Implementation status');
  for (const c of data.controls) {
    const gap = c.status === 'missing' ? ' [GAP]' : c.status === 'partial' ? ' [PARTIAL]' : '';
    pdf.line(`${c.name}${gap}`);
    for (const item of c.checklist_items) {
      pdf.line(`  - ${item}`, 9);
    }
  }
  pdf.subheading('Remediation roadmap');
  for (const c of data.controls.filter((x) => x.status !== 'documented')) {
    pdf.line(`• Complete ${c.name} (${c.items_completed}/${c.items_total} items done)`);
  }
  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return pdf.save(`security-auditor-report-${slug}.pdf`);
}
