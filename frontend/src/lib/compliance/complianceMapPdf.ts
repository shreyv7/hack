import type { ComplianceMapChapter, ComplianceMapSectionDetail, ComplianceMapSummary } from '@/types/compliance';
import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';

export function downloadComplianceMapPdf(
  summary: ComplianceMapSummary,
  chapters: ComplianceMapChapter[],
  sectionDetail: ComplianceMapSectionDetail | null,
  orgName: string
): string {
  const pdf = new CompliancePdf('DPDPA 2023 Compliance Map');
  pdf.line(`Organization: ${orgName}`);
  pdf.line(`Exported: ${new Date().toLocaleString('en-IN')}`);
  pdf.line(
    `Coverage: ${summary.sections_covered}/${summary.sections_total} sections | ` +
      `Score: ${summary.compliance_score}/100 | Features: ${summary.features_mapped}`
  );
  pdf.subheading('Chapter overview');
  for (const ch of chapters) {
    pdf.line(`Ch.${ch.number} ${ch.title} (${ch.sections.length} sections)`);
    for (const s of ch.sections) {
      pdf.line(`  §${s.number} ${s.title} — ${s.status} (${s.feature_count} features)`, 9);
    }
  }
  if (sectionDetail) {
    pdf.subheading(sectionDetail.title);
    pdf.line(sectionDetail.statute.slice(0, 800));
    for (const f of sectionDetail.features) {
      pdf.line(`• ${f.name} — ${f.status} — ${f.evidence_count} evidence`, 9);
    }
  }
  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return pdf.save(`dpdpa-compliance-map-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
