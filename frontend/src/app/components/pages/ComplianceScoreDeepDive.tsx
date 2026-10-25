import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Sparkles,
  Download,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { PenaltyChip } from '@/app/components/ui/PenaltyChip';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { ShieldAICard } from '@/app/components/common/ShieldAICard';
import { useComplianceScore } from '@/hooks/useComplianceScore';
import { fetchShieldAiStatus, type ShieldAiStatus } from '@/lib/api/shieldAi';
import { fetchWorkspace } from '@/lib/api/workspace';
import { downloadComplianceScorePdf } from '@/lib/dashboard/scorePdf';
import { notify } from '@/app/utils/notify';
import type { ComplianceScoreSection } from '@/types/dashboard';

type SectionStatus = 'compliant' | 'minor' | 'risk';

interface StatusDisplay {
  text: string;
  bgClassName: string;
  textClassName: string;
  icon: string;
}

const GAUGE_CIRCUMFERENCE = 534.07;
const MINI_GAUGE_CIRCUMFERENCE = 125.66;

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'Not yet calculated';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Tailwind classes and label for a section compliance status badge. */
function getStatusDisplay(status: SectionStatus): StatusDisplay {
  if (status === 'compliant') {
    return {
      text: 'Compliant',
      textClassName: 'text-[var(--status-success)]',
      bgClassName: 'bg-[var(--status-success-bg)]',
      icon: '✓',
    };
  }
  if (status === 'minor') {
    return {
      text: 'Minor gap',
      textClassName: 'text-[var(--status-warning)]',
      bgClassName: 'bg-[var(--status-warning-bg)]',
      icon: '⚠',
    };
  }
  if (status === 'risk') {
    return {
      text: 'At risk',
      textClassName: 'text-[var(--status-danger)]',
      bgClassName: 'bg-[var(--status-danger-bg)]',
      icon: '⚠',
    };
  }
  return {
    text: status,
    textClassName: 'text-[var(--text-secondary)]',
    bgClassName: 'bg-[var(--surface-raised)]',
    icon: '',
  };
}

/** SVG stroke color for a section mini gauge from its score. */
function scoreStrokeColor(score: number): string {
  if (score >= 80) return 'var(--status-success)';
  if (score >= 60) return 'var(--status-warning)';
  return 'var(--status-danger)';
}

/**
 * Deep-dive compliance score dashboard with DPDPA section breakdown and Shield AI insights.
 */
export function ComplianceScoreDeepDive(): ReactElement {
  const navigate = useNavigate();
  const {
    score,
    breakdown,
    loading,
    error,
    reload,
    recalculate,
    recalculating,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgName,
    orgIdParam,
  } = useComplianceScore();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string | null>(null);
  const [shieldAiStatus, setShieldAiStatus] = useState<ShieldAiStatus | null>(null);

  const overallScore = score?.overall_score ?? 0;
  const sections = breakdown?.sections ?? [];
  const scoreDelta = score?.score_delta_week;

  useEffect(() => {
    if (!hasOrg) return;
    void fetchWorkspace(orgIdParam)
      .then((ws) => setIndustry(ws.primary_industry ?? null))
      .catch(() => setIndustry(null));
  }, [hasOrg, orgIdParam]);

  useEffect(() => {
    if (!hasOrg) return;
    void fetchShieldAiStatus()
      .then(setShieldAiStatus)
      .catch(() => setShieldAiStatus({ configured: false, model_id: null, region: null }));
  }, [hasOrg]);

  const handleExport = (): void => {
    if (!score || !breakdown) return;
    downloadComplianceScorePdf(score, breakdown, orgName);
    notify('Compliance score PDF downloaded');
  };

  const topGaps = sections
    .flatMap((s) => s.gaps.map((g) => ({ section: s, gap: g })))
    .slice(0, 3);

  const shieldAiContext = useMemo(() => {
    if (!score) return '';
    const gapLines = topGaps.map(
      ({ section, gap }) =>
        `${section.statute_reference} ${section.title} — ${gap.label} (${gap.severity} severity)`,
    );
    const weakSections = sections
      .filter((s) => s.status === 'risk' || s.status === 'minor')
      .slice(0, 8)
      .map(
        (s) =>
          `${s.statute_reference} ${s.title}: ${s.score}% complete (${s.controls_completed}/${s.controls_total} controls)`,
      );
    return [
      `Organization: ${orgName}`,
      industry ? `Industry: ${industry}` : null,
      `Overall DPDPA compliance score: ${overallScore}% (${score.status_label})`,
      `Penalty exposure — mitigated: ₹${score.penalty_mitigated_crores} Cr; worst case: ₹${score.penalty_worst_crores} Cr`,
      gapLines.length ? `Priority control gaps:\n${gapLines.join('\n')}` : 'No critical control gaps flagged.',
      weakSections.length ? `Sections needing attention:\n${weakSections.join('\n')}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  }, [score, topGaps, sections, orgName, industry, overallScore]);

  const shieldAiFallback = useMemo(
    () =>
      topGaps.length > 0
        ? topGaps.map(
            ({ section, gap }) =>
              `Close the gap in ${section.statute_reference} (${section.title}): ${gap.label} — document evidence in the mapped module.`,
          )
        : [
            'Compliance posture looks healthy across tracked DPDPA sections. Schedule a quarterly RoPA review and recalculate the score after major changes.',
          ],
    [topGaps],
  );

  const openShieldAi = (query: string): void => {
    navigate('/ai/copilot', { state: { query } });
  };

  return (
    <ConsentManagementGate
      title="Compliance Score"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="size-full overflow-auto">
      <div className="max-w-7xl mx-auto p-8 space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <Link to="/dashboard" className="hover:underline">
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-[var(--text-primary)]">Compliance Score</span>
        </div>

        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">Compliance Score</h1>
            <p className="text-sm flex items-center gap-2 text-[var(--text-tertiary)]">
              <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
              Last calculated {formatTimestamp(score?.last_calculated_at)}
            </p>
          </div>
          <Button
            variant="secondary"
            size="md"
            disabled={recalculating}
            onClick={() => void recalculate()}
          >
            {recalculating ? 'Recalculating…' : 'Recalculate'}
          </Button>
        </div>

        {/* Hero Section */}
        <div
          className={cn(
            'p-8 rounded-xl min-h-[280px]',
            'border border-[var(--border-default)]',
            'bg-gradient-to-br from-[var(--status-ai-bg)] to-[var(--status-info-bg)]',
          )}
        >
          <div className="flex items-center gap-8">
            {/* Large Gauge */}
            <div className="flex-shrink-0 flex flex-col items-center">
              <div className="relative w-60 h-60">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="var(--surface-raised)"
                    strokeWidth="20"
                  />
                  <circle
                    cx="100"
                    cy="100"
                    r="85"
                    fill="none"
                    stroke="var(--status-success)"
                    strokeWidth="20"
                    strokeDasharray={`${(overallScore / 100) * GAUGE_CIRCUMFERENCE} ${GAUGE_CIRCUMFERENCE}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-6xl font-semibold text-[var(--text-primary)]">{overallScore}</div>
                  <div className="text-sm text-[var(--text-tertiary)]">out of 100</div>
                </div>
              </div>
              <div
                className={cn(
                  'mt-4 px-4 py-1.5 rounded-full text-sm font-semibold',
                  'bg-[var(--status-success-bg)] text-[var(--status-success)]',
                )}
              >
                {score?.status_label ?? '—'}
              </div>
            </div>

            {/* Center Text */}
            <div className="flex-1 flex items-center justify-center">
              <p className="text-center text-sm max-w-xs text-[var(--text-secondary)]">
                Penalty-anchored DPDPA 2023 compliance posture
              </p>
            </div>

            {/* Stat Cards */}
            <div className="flex-shrink-0 space-y-3 w-[280px]">
              <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                <div className="text-xs font-medium mb-1 text-[var(--text-tertiary)]">Score change this week</div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'text-2xl font-semibold',
                      scoreDelta == null
                        ? 'text-[var(--text-primary)]'
                        : scoreDelta > 0
                          ? 'text-[var(--status-success)]'
                          : scoreDelta < 0
                            ? 'text-[var(--status-danger)]'
                            : 'text-[var(--text-primary)]',
                    )}
                  >
                    {scoreDelta != null ? `${scoreDelta > 0 ? '+' : ''}${scoreDelta}` : '—'}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">pts</span>
                  {scoreDelta != null && scoreDelta !== 0 ? (
                    scoreDelta > 0 ? (
                      <ArrowUp
                        className="w-4 h-4 ml-auto text-[var(--status-success)]"
                        strokeWidth={2}
                      />
                    ) : (
                      <ArrowDown
                        className="w-4 h-4 ml-auto text-[var(--status-danger)]"
                        strokeWidth={2}
                      />
                    )
                  ) : null}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                <div className="text-xs font-medium mb-1 text-[var(--text-tertiary)]">Penalty exposure</div>
                <div className="flex items-center gap-2">
                  <PenaltyChip amount={score?.penalty_mitigated_crores ?? 0} />
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                <div className="text-xs font-medium mb-1 text-[var(--text-tertiary)]">Days since last incident</div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-semibold text-[var(--text-primary)]">
                    {score?.days_since_incident ?? '—'}
                  </span>
                  <span className="text-sm text-[var(--text-secondary)]">days</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* DPDPA Rule Breakdown */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-semibold mb-2 text-[var(--text-primary)]">
              DPDPA 2023 — Section-by-Section Compliance
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Each rule mapped to its statutory maximum penalty
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-[var(--status-danger)] bg-[var(--status-danger-bg)] px-4 py-3 text-sm">
              {error}{' '}
              <button type="button" className="underline" onClick={() => void reload()}>
                Retry
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            {sections.map((section: ComplianceScoreSection) => {
              const status = getStatusDisplay(section.status as SectionStatus);
              const isExpanded = expandedSection === section.section_key;

              return (
                <div
                  key={section.section_key}
                  className="rounded-xl overflow-hidden bg-[var(--surface-card)] border border-[var(--border-default)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedSection(isExpanded ? null : section.section_key)
                    }
                    className="w-full p-5 flex items-center gap-6 hover:bg-black/5 transition-colors"
                  >
                    <div className="w-16 text-sm font-mono font-semibold flex-shrink-0 text-[var(--text-tertiary)]">
                      {section.statute_reference}
                    </div>

                    <div className="flex-1 text-left">
                      <div className="font-semibold text-base text-[var(--text-primary)]">{section.title}</div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="relative w-12 h-12">
                        <svg viewBox="0 0 50 50" className="w-full h-full -rotate-90">
                          <circle cx="25" cy="25" r="20" fill="none" stroke="var(--surface-raised)" strokeWidth="5" />
                          <circle
                            cx="25"
                            cy="25"
                            r="20"
                            fill="none"
                            stroke={scoreStrokeColor(section.score)}
                            strokeWidth="5"
                            strokeDasharray={`${(section.score / 100) * MINI_GAUGE_CIRCUMFERENCE} ${MINI_GAUGE_CIRCUMFERENCE}`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-semibold text-[var(--text-primary)]">{section.score}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-sm flex-shrink-0 text-[var(--text-secondary)] w-[100px]">
                      <span className="font-semibold text-[var(--text-primary)]">
                        {section.controls_completed}/{section.controls_total}
                      </span>{' '}
                      controls
                    </div>

                    <div className="flex-shrink-0">
                      <PenaltyChip amount={section.penalty_crores ?? 0} />
                    </div>

                    <div
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 flex-shrink-0 min-w-[110px]',
                        status.bgClassName,
                        status.textClassName,
                      )}
                    >
                      {status.icon} {status.text}
                    </div>

                    <div className="flex-shrink-0">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-[var(--text-tertiary)]" strokeWidth={1.5} />
                      )}
                    </div>
                  </button>

                  {isExpanded ? (
                    <div className="px-5 pb-5 pt-2 border-t border-[var(--border-default)] bg-[var(--surface-raised)] space-y-4">
                      {section.statute_excerpt ? (
                        <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line border-l-2 border-[var(--brand-primary)] pl-3">
                          {section.statute_excerpt}
                        </p>
                      ) : null}
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
                        Mapped controls ({section.controls_completed}/{section.controls_total})
                      </p>
                      {(section.controls.length ? section.controls : section.gaps.map((g) => ({
                        name: g.label,
                        complete: false,
                        configure_route: section.configure_route,
                      }))).map((control) => (
                        <div key={control.name} className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            {control.complete ? (
                              <div className="w-5 h-5 rounded flex items-center justify-center bg-[var(--status-success)]">
                                <Check className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                              </div>
                            ) : (
                              <div
                                className={cn(
                                  'w-5 h-5 rounded flex items-center justify-center',
                                  'bg-[var(--status-danger-bg)] border border-[var(--status-danger)]',
                                )}
                              >
                                <X className="w-3.5 h-3.5 text-[var(--status-danger)]" strokeWidth={2.5} />
                              </div>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm mb-1 text-[var(--text-primary)]">{control.name}</div>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                onClick={() => navigate(control.configure_route)}
                                className="text-xs font-medium hover:underline text-[var(--brand-primary)]"
                              >
                                Configure →
                              </button>
                              <button
                                type="button"
                                onClick={() => navigate('/ai/copilot', { state: { query: control.name } })}
                                className="text-xs font-medium hover:underline flex items-center gap-1 text-[var(--status-ai)]"
                              >
                                <Sparkles className="w-3 h-3" strokeWidth={2} />
                                Explain this requirement
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {section.controls.length === 0 && section.gaps.length === 0 ? (
                        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] px-4 py-3 text-sm text-[var(--text-secondary)]">
                          No control mappings are available for this section yet.{' '}
                          <button
                            type="button"
                            onClick={() => navigate('/compliance/map')}
                            className="font-medium text-[var(--brand-primary)] hover:underline"
                          >
                            View DPDPA Compliance Map →
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Shield AI Insights */}
        <div
          className={cn(
            'p-6 rounded-xl border border-[var(--border-default)]',
            'bg-gradient-to-br from-[var(--status-ai-bg)] to-[var(--status-info-bg)]',
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center',
                  'bg-gradient-to-br from-[var(--status-ai)] to-[var(--brand-primary)]',
                )}
              >
                <Sparkles className="w-5 h-5 text-white" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Shield AI&apos;s Insights</h3>
                <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                  {shieldAiStatus?.configured
                    ? 'Prioritized actions based on your compliance posture'
                    : 'Shield AI is not configured — contact your administrator'}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => openShieldAi(shieldAiContext || 'How can I improve my DPDPA compliance score?')}>
              Open Shield AI →
            </Button>
          </div>

          <ShieldAICard
            title="Recommended actions"
            topic="DPDPA 2023 compliance improvement steps based on the organization's compliance score, statutory sections, and open control gaps"
            context={shieldAiContext}
            suggestions={shieldAiFallback}
            count={3}
            className="bg-[var(--surface-card)] border border-[var(--border-default)] mb-4"
          />

          <div className="space-y-4">
            {topGaps.length === 0 ? (
              <div className="p-5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]">
                <p className="text-sm text-[var(--text-primary)]">No outstanding control gaps in tracked sections.</p>
              </div>
            ) : (
              topGaps.map(({ section, gap }) => (
                <div
                  key={`${section.section_key}-${gap.label}`}
                  className="p-5 rounded-lg bg-[var(--surface-card)] border border-[var(--border-default)]"
                >
                  <p className="text-sm mb-3 text-[var(--text-primary)]">
                    {section.statute_reference} {section.title}: {gap.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" onClick={() => navigate(section.configure_route)}>
                      Configure in module →
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        openShieldAi(
                          `Explain the DPDPA requirement "${gap.label}" under ${section.statute_reference} ${section.title} and how to close this compliance gap for ${orgName}.`,
                        )
                      }
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" strokeWidth={2} />
                      Ask Shield AI
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Download Strip */}
        <div
          className={cn(
            'sticky bottom-0 p-5 rounded-xl flex items-center gap-4',
            'bg-[var(--surface-card)] border border-[var(--border-default)]',
            'shadow-[0_-4px_12px_rgba(0,0,0,0.08)]',
          )}
        >
          <Button variant="primary" size="md" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" strokeWidth={1.5} />
            Export this report as PDF
          </Button>
        </div>
      </div>
    </div>
    </ConsentManagementGate>
  );
}
