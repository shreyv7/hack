import { CompliancePdf } from '@/lib/compliance/compliancePdfBase';
import type {
  ActivityFeedItem,
  ComplianceScore,
  ComplianceScoreBreakdown,
  ComplianceScoreSection,
  DashboardData,
  DeadlineItem,
  ModuleHealthItem,
  RiskHeatmapCell,
} from '@/types/dashboard';

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Not yet calculated';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

function postureNarrative(score: number): string {
  if (score >= 80) {
    return 'The organization demonstrates strong DPDPA 2023 compliance posture. Continue monitoring module health, DSAR SLAs, and consent proof obligations to maintain good standing.';
  }
  if (score >= 60) {
    return 'Compliance posture shows minor gaps across one or more DPDPA modules. Review open control gaps and upcoming deadlines to prevent score deterioration and penalty exposure.';
  }
  return 'Critical compliance gaps require immediate attention. Prioritize unresolved controls, breach readiness, consent proof, and DSAR SLA adherence to reduce regulatory and financial risk under DPDPA 2023.';
}

function totalGaps(sections: ComplianceScoreSection[]): number {
  return sections.reduce((sum, section) => sum + section.gaps.length, 0);
}

function topGaps(sections: ComplianceScoreSection[], limit = 8) {
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, warning: 3, low: 4 };
  return sections
    .flatMap((section) =>
      section.gaps.map((gap) => ({ ...gap, sectionTitle: section.title })),
    )
    .sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99))
    .slice(0, limit);
}

function processingTotals(data: DashboardData) {
  return data.processingTrend.reduce(
    (acc, point) => ({
      consents: acc.consents + point.consents,
      dsar: acc.dsar + point.dsar_requests,
      integrations: acc.integrations + point.integration_events,
    }),
    { consents: 0, dsar: 0, integrations: 0 },
  );
}

function renderSectionBreakdown(pdf: CompliancePdf, sections: ComplianceScoreSection[]): void {
  pdf.subheading('DPDPA map section breakdown');
  if (sections.length === 0) {
    pdf.paragraph('No section breakdown available. Recalculate compliance score to populate DPDPA map sections.');
    return;
  }

  for (const section of sections) {
    pdf.ensure(28);
    pdf.progressBar(
      `${section.statute_reference} — ${section.title}`,
      section.score,
      `${section.controls_completed}/${section.controls_total} controls · ${section.gaps.length} gaps`,
    );

    if (section.gaps.length > 0) {
      for (const gap of section.gaps.slice(0, 4)) {
        pdf.gapItem(gap.severity, gap.label);
      }
      if (section.gaps.length > 4) {
        pdf.paragraph(`+${section.gaps.length - 4} more gaps in this section`, 8);
      }
    }

    const incomplete = section.controls.filter((c) => !c.complete).slice(0, 3);
    if (incomplete.length > 0) {
      pdf.paragraph('Outstanding controls:', 8);
      for (const control of incomplete) {
        pdf.bulletItem(control.name);
      }
    }
    pdf.divider();
  }
}

/** Full dashboard posture report — used by the main Dashboard Export Report button. */
export function downloadDashboardReportPdf(
  data: DashboardData,
  orgName: string,
  exportedBy?: string,
): string {
  const summary = data.summary;
  const score = data.complianceScore ?? {
    overall_score: summary.compliance_score,
    status_label: summary.compliance_status,
    penalty_mitigated_crores: summary.penalty_mitigated_crores,
    penalty_worst_crores: summary.penalty_worst_crores,
    last_calculated_at: summary.last_calculated_at,
    score_delta_week: summary.score_delta_week,
    days_since_incident: null,
  };
  const breakdown = data.complianceBreakdown ?? { sections: [] };
  const exportedAt = new Date().toISOString();
  const pdf = new CompliancePdf();

  pdf.brandHeader('Compliance Posture Report · DPDPA 2023');
  pdf.reportTitle('Executive Compliance Dashboard');
  pdf.metaRow('Organization', orgName);
  pdf.metaRow('Generated', formatTimestamp(exportedAt));
  pdf.metaRow('Score calculated', formatTimestamp(score.last_calculated_at));
  if (exportedBy) pdf.metaRow('Exported by', exportedBy);
  pdf.divider();

  pdf.subheading('Executive summary');
  pdf.scoreHero(score.overall_score, score.status_label, score.score_delta_week);
  pdf.paragraph(postureNarrative(score.overall_score));

  pdf.kpiGrid([
    { label: 'Penalty mitigated', value: `₹${score.penalty_mitigated_crores} Cr` },
    { label: 'Worst-case penalty', value: `₹${score.penalty_worst_crores} Cr` },
    { label: 'Open gaps', value: String(totalGaps(breakdown.sections)) },
    {
      label: 'Days since incident',
      value: score.days_since_incident != null ? String(score.days_since_incident) : '—',
    },
  ]);
  pdf.divider();

  pdf.subheading('Operational metrics');
  pdf.kpiGrid(
    summary.metric_cards.map((card) => ({
      label: card.label,
      value: card.value,
      hint: card.trend,
    })),
    2,
  );

  if (summary.sidebar_kpis.length > 0) {
    pdf.subheading('Operational KPIs');
    pdf.table(
      ['KPI', 'Value'],
      summary.sidebar_kpis.map((kpi) => [kpi.label, kpi.value]),
      [120, 62],
    );
  }
  pdf.divider();

  if (data.moduleHealth.length > 0) {
    pdf.subheading('Module health');
    pdf.table(
      ['Module', 'Score', 'Gaps', 'Status'],
      data.moduleHealth.map((m: ModuleHealthItem) => [m.label, `${m.score}%`, String(m.gap_count), m.status]),
      [80, 30, 24, 48],
    );
    pdf.divider();
  }

  if (data.riskHeatmap.length > 0) {
    pdf.subheading('Risk heatmap');
    pdf.table(
      ['Category', 'Score', 'Risk level'],
      data.riskHeatmap.map((cell: RiskHeatmapCell) => [cell.category, String(cell.score), cell.level]),
      [80, 30, 72],
    );
    pdf.divider();
  }

  const gaps = topGaps(breakdown.sections);
  if (gaps.length > 0) {
    pdf.subheading('Priority compliance gaps');
    for (const gap of gaps) {
      pdf.gapItem(gap.severity, gap.label, gap.sectionTitle);
    }
    pdf.divider();
  }

  if (data.deadlines.length > 0) {
    pdf.subheading('Upcoming deadlines');
    pdf.table(
      ['Task', 'Due', 'Category', 'Severity'],
      data.deadlines.slice(0, 8).map((d: DeadlineItem) => [
        d.title,
        formatDue(d.due_at),
        d.category,
        d.severity,
      ]),
      [70, 42, 40, 30],
    );
    pdf.divider();
  }

  const totals = processingTotals(data);
  if (data.processingTrend.length > 0) {
    pdf.subheading('Data processing activity (reporting period)');
    pdf.kpiGrid([
      { label: 'Consent receipts', value: totals.consents.toLocaleString('en-IN') },
      { label: 'DSAR requests', value: totals.dsar.toLocaleString('en-IN') },
      { label: 'Integration events', value: totals.integrations.toLocaleString('en-IN') },
    ], 3);
    pdf.divider();
  }

  if (data.activityFeed.length > 0) {
    pdf.subheading('Recent activity');
    for (const item of data.activityFeed.slice(0, 10) as ActivityFeedItem[]) {
      pdf.bulletItem(`${formatTimestamp(item.time)} · ${item.module}: ${item.action} (${item.actor})`);
    }
    pdf.divider();
  }

  if (data.onboarding.alerts.length > 0) {
    pdf.subheading('Onboarding & configuration alerts');
    for (const alert of data.onboarding.alerts) {
      pdf.bulletItem(`[${alert.severity}] ${alert.message}`);
    }
    pdf.divider();
  }

  renderSectionBreakdown(pdf, breakdown.sections);

  pdf.paragraph(
    'This report was generated from live Vajra Vajra dashboard data. It is intended for internal compliance review, DPO sign-off, and audit preparation under the Digital Personal Data Protection Act, 2023. Verify critical findings against source modules before external submission.',
    8,
  );

  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'org';
  return pdf.save(`dpdpa-dashboard-report-${slug}-${exportedAt.slice(0, 10)}.pdf`);
}

/** Compliance score deep-dive export — enhanced section detail. */
export function downloadComplianceScorePdf(
  score: ComplianceScore,
  breakdown: ComplianceScoreBreakdown,
  orgName: string,
): string {
  const pdf = new CompliancePdf();
  const exportedAt = new Date().toISOString();

  pdf.brandHeader('Compliance Score Report · DPDPA 2023');
  pdf.reportTitle('DPDPA Compliance Score');
  pdf.metaRow('Organization', orgName);
  pdf.metaRow('Generated', formatTimestamp(exportedAt));
  pdf.metaRow('Last calculated', formatTimestamp(score.last_calculated_at));
  pdf.divider();

  pdf.subheading('Score overview');
  pdf.scoreHero(score.overall_score, score.status_label, score.score_delta_week);
  pdf.paragraph(postureNarrative(score.overall_score));
  pdf.kpiGrid([
    { label: 'Penalty mitigated', value: `₹${score.penalty_mitigated_crores} Cr` },
    { label: 'Worst-case penalty', value: `₹${score.penalty_worst_crores} Cr` },
    { label: 'Open gaps', value: String(totalGaps(breakdown.sections)) },
    {
      label: 'Days since incident',
      value: score.days_since_incident != null ? String(score.days_since_incident) : '—',
    },
  ]);
  pdf.divider();

  renderSectionBreakdown(pdf, breakdown.sections);

  pdf.paragraph(
    'Generated by Vajra Vajra. For auditor handoff, attach supporting evidence from Proof Vault, Security Safeguards, and DSAR modules.',
    8,
  );

  const slug = orgName.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'org';
  return pdf.save(`compliance-score-${slug}-${exportedAt.slice(0, 10)}.pdf`);
}
