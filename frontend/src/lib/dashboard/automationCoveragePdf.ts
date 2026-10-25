import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';
import type { AutomationCoverage } from '@/types/dashboard';

export function downloadAutomationCoveragePdf(data: AutomationCoverage, orgName: string): string {
  const pdf = new CompliancePdf('DPDPA Automation Coverage Map');
  pdf.line(`Organization: ${orgName}`);
  pdf.line(`Coverage: ${data.coverage_percent}% of applicable obligations`);
  pdf.line(
    `Fully automated: ${data.fully_automated} · Partial: ${data.partial} · Manual: ${data.manual} · N/A: ${data.not_applicable}`
  );
  pdf.subheading('Sections');
  for (const section of data.sections) {
    if (section.automation_status === 'na') continue;
    pdf.line(
      `S.${section.section_number} ${section.title} — ${section.automation_status}`
    );
  }
  return pdf.save(`automation-coverage-${new Date().toISOString().slice(0, 10)}.pdf`);
}
