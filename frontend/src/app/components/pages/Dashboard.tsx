import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Gavel, Scale, TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { ComplianceGauge } from '@/app/components/ui/ComplianceGauge';
import { PenaltyChip } from '@/app/components/ui/PenaltyChip';
import { MetricCard } from '@/app/components/dashboard/MetricCard';
import { ModuleHealth } from '@/app/components/dashboard/ModuleHealth';
import { ComplianceTrend } from '@/app/components/dashboard/ComplianceTrend';
import { UpcomingDeadlines } from '@/app/components/dashboard/UpcomingDeadlines';
import { CopilotPanel } from '@/app/components/dashboard/CopilotPanel';
import { AlertBanner } from '@/app/components/dashboard/AlertBanner';
import { RecentActivity } from '@/app/components/dashboard/RecentActivity';
import { DataProcessingChart } from '@/app/components/dashboard/DataProcessingChart';
import { RiskHeatmap } from '@/app/components/dashboard/RiskHeatmap';
import { DashboardSidebar } from '@/app/components/dashboard/DashboardSidebar';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { useDashboard } from '@/hooks/useDashboard';
import { displayName } from '@/lib/auth/display';
import { downloadDashboardReportPdf } from '@/lib/dashboard/scorePdf';
import { notify } from '@/app/utils/notify';
import type { DashboardMetricCard } from '@/types/dashboard';
import { fetchLegitimateUseSummary } from '@/lib/api/legitimateUse';
import { fetchRegulatoryProceedingSummary } from '@/lib/api/regulatoryProceedings';

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Not yet calculated';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function statusBadgeClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes('good') || normalized.includes('healthy')) {
    return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  }
  if (normalized.includes('risk') || normalized.includes('critical')) {
    return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)]';
  }
  return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
}

const METRIC_EMPTY_HINTS: Record<string, string> = {
  consents: 'No consents yet — publish a notice to start collecting proof.',
  pii: 'No PII findings — run a scan to detect sensitive data.',
  dsar: 'No open DSARs — rights requests will appear here.',
  breach: 'No active incidents — breach cases will surface here.',
};

const HERO_LINKS = [
  { label: 'Score breakdown', path: '/compliance/score' },
  { label: 'DPDPA map', path: '/compliance/map' },
  { label: 'CISO center', path: '/security/ciso' },
  { label: 'Audit log', path: '/audit/log' },
] as const;

function metricSubtitle(card: DashboardMetricCard): string {
  if (card.trend) return card.trend;
  const numeric = Number.parseInt(card.value.replace(/,/g, ''), 10);
  if (!Number.isNaN(numeric) && numeric === 0) {
    return METRIC_EMPTY_HINTS[card.key] ?? 'No data yet for this metric.';
  }
  return '';
}

/**
 * Main compliance dashboard with posture metrics, module health, and activity feeds.
 */
export function Dashboard(): ReactElement {
  const navigate = useNavigate();
  const {
    user,
    data,
    loading,
    error,
    reload,
    recalculate,
    recalculating,
    hasOrg,
    orgIdParam,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgName,
  } = useDashboard();
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [governanceAlerts, setGovernanceAlerts] = useState({
    dueForReview: 0,
    overdueProceedings: 0,
  });

  useEffect(() => {
    if (!hasOrg) return;
    let cancelled = false;
    async function loadGovernanceAlerts() {
      try {
        const [legitimateSummary, regulatorySummary] = await Promise.all([
          fetchLegitimateUseSummary(orgIdParam),
          fetchRegulatoryProceedingSummary(orgIdParam),
        ]);
        if (!cancelled) {
          setGovernanceAlerts({
            dueForReview: legitimateSummary.due_for_review,
            overdueProceedings: regulatorySummary.overdue_count,
          });
        }
      } catch {
        if (!cancelled) {
          setGovernanceAlerts({ dueForReview: 0, overdueProceedings: 0 });
        }
      }
    }
    void loadGovernanceAlerts();
    return () => {
      cancelled = true;
    };
  }, [hasOrg, orgIdParam]);

  const summary = data?.summary;
  const visibleAlerts = useMemo(
    () => data?.onboarding.alerts.filter((a) => !dismissedAlerts.has(a.key)) ?? [],
    [data?.onboarding.alerts, dismissedAlerts],
  );

  const totalGaps = useMemo(
    () =>
      data?.complianceBreakdown?.sections.reduce((sum, section) => sum + section.gaps.length, 0) ?? 0,
    [data?.complianceBreakdown],
  );

  const handleExport = (): void => {
    if (!summary || !data) return;
    notify('Generating dashboard report PDF…');
    downloadDashboardReportPdf(data, orgName, user ? displayName(user) : undefined);
  };

  return (
    <ConsentManagementGate
      title="Dashboard"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      <div className="relative min-h-full">
        {visibleAlerts.map((alert) => (
          <div key={alert.key} className="sticky top-0 z-10">
            <AlertBanner
              message={alert.message}
              onConfigure={() => navigate(alert.route_path)}
              onDismiss={() => setDismissedAlerts((prev) => new Set(prev).add(alert.key))}
            />
          </div>
        ))}

        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-5 max-w-[1600px] mx-auto">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold mb-1 text-[var(--text-primary)]">
                Welcome back, {user ? displayName(user) : 'there'}
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">
                {isSuperadmin ? `${orgName} · ` : ''}
                Compliance posture as of {formatTimestamp(summary?.last_calculated_at)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="md"
                disabled={recalculating}
                onClick={() => void recalculate()}
              >
                {recalculating ? 'Recalculating…' : 'Recalculate'}
              </Button>
              <Button variant="primary" size="md" onClick={handleExport} disabled={!summary}>
                Export Report
              </Button>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm">
              {error}{' '}
              <button type="button" className="underline" onClick={() => void reload()}>
                Retry
              </button>
            </div>
          ) : null}

          {/* Hero posture — compact */}
          <div className="p-5 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr_auto] gap-6 items-center">
              <button
                type="button"
                className="flex flex-col items-center gap-2 shrink-0 mx-auto md:mx-0"
                onClick={() => navigate('/compliance/score')}
              >
                <ComplianceGauge size={120} score={summary?.compliance_score ?? 0} />
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${statusBadgeClass(summary?.compliance_status ?? '')}`}
                >
                  {summary?.compliance_status ?? '—'}
                </div>
              </button>

              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {summary
                    ? `${summary.compliance_score >= 80 ? 'Strong posture' : summary.compliance_score >= 60 ? 'Minor gaps — review module health below' : 'Critical gaps require immediate attention'}. Last calculated ${formatTimestamp(summary.last_calculated_at)}.`
                    : 'Loading compliance posture…'}
                </p>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-[var(--text-tertiary)]">Open gaps </span>
                    <span className="font-semibold text-[var(--text-primary)]">{totalGaps}</span>
                  </div>
                  {data?.complianceScore?.days_since_incident != null ? (
                    <div>
                      <span className="text-[var(--text-tertiary)]">Days since incident </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {data.complianceScore.days_since_incident}
                      </span>
                    </div>
                  ) : null}
                  {!data?.onboarding.complete ? (
                    <div className="text-[var(--status-warning)] font-medium">
                      {data?.onboarding.alerts.length ?? 0} onboarding item
                      {(data?.onboarding.alerts.length ?? 0) === 1 ? '' : 's'} pending
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {HERO_LINKS.map((link) => (
                    <button
                      key={link.path}
                      type="button"
                      onClick={() => navigate(link.path)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--brand-primary)] hover:border-[var(--brand-primary)] transition-colors"
                    >
                      {link.label}
                      <ArrowRight className="size-3" />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3 md:text-right shrink-0">
                <div>
                  <div className="text-xs mb-0.5 text-[var(--text-secondary)]">DPDPA 2023 Compliance</div>
                  <div className="flex items-center gap-2 md:justify-end flex-wrap">
                    <span className="text-2xl font-semibold text-[var(--text-primary)]">
                      {summary?.compliance_score ?? '—'}%
                    </span>
                    {summary?.score_delta_week != null ? (
                      <div
                        className={cn(
                          'flex items-center gap-1 text-xs font-medium',
                          summary.score_delta_week > 0
                            ? 'text-[var(--status-success)]'
                            : summary.score_delta_week < 0
                              ? 'text-[var(--status-danger)]'
                              : 'text-[var(--text-secondary)]',
                        )}
                      >
                        {summary.score_delta_week > 0 ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : summary.score_delta_week < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : null}
                        <span>
                          {summary.score_delta_week > 0 ? '+' : ''}
                          {summary.score_delta_week} pts/wk
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div>
                  <div className="text-xs mb-0.5 text-[var(--text-secondary)]">Penalty exposure</div>
                  <div className="flex items-center gap-2 md:justify-end flex-wrap">
                    <PenaltyChip amount={summary?.penalty_mitigated_crores ?? 0} />
                    {summary ? (
                      <span className="text-xs text-[var(--text-tertiary)]">
                        worst ₹{summary.penalty_worst_crores} Cr
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(summary?.metric_cards ?? []).map((card) => (
              <MetricCard
                key={card.key}
                title={card.label}
                value={card.value}
                subtitle={metricSubtitle(card)}
                warning={card.key === 'dsar' && Boolean(card.trend)}
                danger={card.key === 'breach' && card.value !== '0'}
                routePath={card.route_path}
              />
            ))}
          </div>

          {governanceAlerts.dueForReview > 0 || governanceAlerts.overdueProceedings > 0 ? (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Governance alerts</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {governanceAlerts.dueForReview > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/governance/advanced/legitimate-use?filter=due')}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] px-4 py-3 text-left hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Scale className="size-5 text-[var(--status-warning)] shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{governanceAlerts.dueForReview} legitimate-use review{governanceAlerts.dueForReview === 1 ? '' : 's'} due</div>
                      <div className="text-xs text-[var(--text-secondary)]">Open Legitimate Use Registry</div>
                    </div>
                  </button>
                ) : null}
                {governanceAlerts.overdueProceedings > 0 ? (
                  <button
                    type="button"
                    onClick={() => navigate('/governance/advanced/regulatory-proceedings?filter=overdue')}
                    className="flex items-center gap-3 rounded-lg border border-[var(--border-default)] px-4 py-3 text-left hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Gavel className="size-5 text-[var(--status-danger)] shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{governanceAlerts.overdueProceedings} overdue proceeding{governanceAlerts.overdueProceedings === 1 ? '' : 's'}</div>
                      <div className="text-xs text-[var(--text-secondary)]">Open Regulatory Proceedings</div>
                    </div>
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <ModuleHealth
            items={data?.moduleHealth ?? []}
            breakdown={data?.complianceBreakdown}
            loading={loading}
          />

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8">
              <ComplianceTrend loading={loading} liveScore={summary?.compliance_score} />
            </div>
            <div className="xl:col-span-4">
              <UpcomingDeadlines items={data?.deadlines ?? []} loading={loading} />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <div className="xl:col-span-8">
              <DataProcessingChart points={data?.processingTrend ?? []} loading={loading} />
            </div>
            <div className="xl:col-span-4">
              <RiskHeatmap cells={data?.riskHeatmap ?? []} loading={loading} compact />
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-7">
              <RecentActivity items={data?.activityFeed ?? []} loading={loading} />
            </div>
            <div className="xl:col-span-5">
              <DashboardSidebar
                kpis={summary?.sidebar_kpis ?? []}
                breakdown={data?.complianceBreakdown}
                loading={loading}
              />
            </div>
          </div>

          <CopilotPanel />
        </div>
      </div>
    </ConsentManagementGate>
  );
}
