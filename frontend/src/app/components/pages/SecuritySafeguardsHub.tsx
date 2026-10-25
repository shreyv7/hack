import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { SectionReference } from '@/app/components/common/SectionReference';
import { ComplianceGauge } from '@/app/components/common/ComplianceGauge';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { MarkdownMessage } from '@/app/components/common/MarkdownMessage';
import { useSecuritySafeguards } from '@/hooks/useSecuritySafeguards';
import {
  downloadSecurityAuditorReportPdf,
  downloadSecurityEvidencePackPdf,
} from '@/lib/compliance/securitySafeguardsPdf';
import { getSecurityChecklistSource } from '@/lib/compliance/securityChecklistSources';
import { fetchVajraAiStatus, vajraAiChat, type VajraAiStatus } from '@/lib/api/vajraAi';
import { ApiError } from '@/lib/api/client';
import type { SecurityControl, SecurityPostureMetric, SecuritySafeguardsSummary } from '@/types/compliance';
import { Popover, PopoverContent, PopoverTrigger } from '@/app/components/ui/popover';
import { AlertTriangle, Check, ChevronDown, Info, Loader2, Sparkles, XCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

function buildControlShieldContext(
  control: SecurityControl,
  orgName: string,
  summary: SecuritySafeguardsSummary | undefined,
): string {
  const checklist =
    control.checklist_items.length > 0
      ? control.checklist_items.map((item) => `- ${item}`).join('\n')
      : null;
  return [
    `Organization: ${orgName}`,
    'Statute: DPDPA Section 8(5) — reasonable security safeguards',
    `Security control: ${control.name} (${control.control_key})`,
    `Status: ${control.status} (${control.items_completed}/${control.items_total} checklist items)`,
    control.evidence ? `Documented evidence: ${control.evidence}` : 'No evidence label on file yet.',
    summary
      ? `Overall safeguards score: ${summary.score}% (${summary.documented_count}/${summary.total_controls} controls documented)`
      : null,
    checklist ? `Checklist items:\n${checklist}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function controlQuickPrompts(control: SecurityControl, orgName: string): { label: string; query: string }[] {
  return [
    {
      label: 'Identify gaps',
      query: `What compliance gaps remain for "${control.name}" at ${orgName} under DPDPA Section 8(5)?`,
    },
    {
      label: 'Evidence checklist',
      query: `What audit evidence should ${orgName} collect to demonstrate "${control.name}" under DPDPA Section 8(5)?`,
    },
    {
      label: 'Implementation steps',
      query: `Suggest practical implementation steps to strengthen "${control.name}" for DPDPA Section 8(5) compliance.`,
    },
  ];
}

function postureCardClass(status: SecurityPostureMetric['status']): string {
  switch (status) {
    case 'success':
      return 'bg-[var(--status-success-bg)]';
    case 'warning':
      return 'bg-[var(--status-warning-bg)]';
    case 'critical':
      return 'bg-red-50 dark:bg-red-950/20';
    default:
      return 'bg-[var(--surface-raised)]';
  }
}

function postureValueClass(status: SecurityPostureMetric['status']): string {
  switch (status) {
    case 'success':
      return 'text-[var(--status-success)]';
    case 'warning':
      return 'text-[var(--status-warning)]';
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-[var(--text-primary)]';
  }
}

function postureLabelClass(status: SecurityPostureMetric['status']): string {
  switch (status) {
    case 'success':
      return 'text-[var(--status-success)]';
    case 'warning':
      return 'text-[var(--status-warning)]';
    case 'critical':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-[var(--text-secondary)]';
  }
}

interface SecurityChecklistInfoButtonProps {
  controlKey: string;
  itemIndex: number;
}

function SecurityChecklistInfoButton({
  controlKey,
  itemIndex,
}: SecurityChecklistInfoButtonProps): ReactElement | null {
  const navigate = useNavigate();
  const source = getSecurityChecklistSource(controlKey, itemIndex);
  if (!source) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-raised)] hover:text-[var(--brand-primary)] cursor-pointer"
          aria-label="Where this checklist item is verified in the platform"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 bg-[var(--surface-card)] border border-[var(--border-default)] text-[var(--text-primary)] p-4"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)] mb-1">
          Platform mapping
        </p>
        <p className="text-sm font-medium mb-2">{source.module}</p>
        <p className="text-xs text-[var(--text-secondary)] mb-1">
          <span className="font-medium text-[var(--text-primary)]">Signal: </span>
          {source.signal}
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-3">{source.verify}</p>
        <button
          type="button"
          onClick={() => navigate(source.route)}
          className="text-xs font-medium text-[var(--brand-primary)] hover:underline cursor-pointer"
        >
          Open {source.module} →
        </button>
      </PopoverContent>
    </Popover>
  );
}

function PostureMetricCard({
  metric,
  label,
}: {
  metric: SecurityPostureMetric;
  label: string;
}): ReactElement {
  return (
    <div className={`p-4 rounded-lg ${postureCardClass(metric.status)}`}>
      <div className={`text-2xl font-semibold mb-1 ${postureValueClass(metric.status)}`}>
        {metric.value}
      </div>
      <div className="text-sm text-[var(--text-secondary)]">{label}</div>
      <div className={`text-xs mt-1 ${postureLabelClass(metric.status)}`}>{metric.status_label}</div>
    </div>
  );
}

function scoreLabelClass(label: string): string {
  switch (label) {
    case 'Strong':
      return 'text-[var(--status-success)]';
    case 'Improving':
      return 'text-[var(--status-warning)]';
    case 'At risk':
      return 'text-orange-600 dark:text-orange-400';
    default:
      return 'text-[var(--status-danger)]';
  }
}

/**
 * Security safeguards hub with control coverage and penalty exposure.
 */
export function SecuritySafeguardsHub(): ReactElement {
  const navigate = useNavigate();
  const {
    safeguards,
    orgName,
    loading,
    error,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
  } = useSecuritySafeguards();
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [vajraAiControlId, setVajraAiControlId] = useState<string | null>(null);
  const [vajraAiQuery, setVajraAiQuery] = useState('');
  const [vajraAiReply, setVajraAiReply] = useState<string | null>(null);
  const [vajraAiLoading, setVajraAiLoading] = useState(false);
  const [vajraAiError, setVajraAiError] = useState<string | null>(null);
  const [vajraAiStatus, setVajraAiStatus] = useState<VajraAiStatus | null>(null);

  const data = safeguards.data;
  const controls = data?.controls ?? [];
  const summary = data?.summary;
  const certifications = data?.certifications ?? [];
  const posture = data?.posture;

  useEffect(() => {
    if (!hasOrg) return;
    void fetchVajraAiStatus()
      .then(setVajraAiStatus)
      .catch(() => setVajraAiStatus({ configured: false, model_id: null, region: null }));
  }, [hasOrg]);

  const openVajraAi = useCallback(
    (query: string) => {
      navigate('/ai/copilot', { state: { query } });
    },
    [navigate],
  );

  const askVajraAi = useCallback(
    async (query: string, control: SecurityControl): Promise<void> => {
      const trimmed = query.trim();
      if (!trimmed) return;

      if (!vajraAiStatus?.configured) {
        notify('Vajra AI is not configured. Please contact your administrator.');
        openVajraAi(trimmed);
        return;
      }

      setVajraAiLoading(true);
      setVajraAiError(null);
      setVajraAiReply(null);
      setVajraAiQuery(trimmed);

      try {
        const context = buildControlShieldContext(control, orgName, summary);
        const { reply } = await vajraAiChat([{ role: 'user', content: trimmed }], context);
        setVajraAiReply(reply);
      } catch (err) {
        setVajraAiError(
          err instanceof ApiError ? err.message : 'Could not reach Vajra AI. Please try again.',
        );
      } finally {
        setVajraAiLoading(false);
      }
    },
    [vajraAiStatus?.configured, orgName, summary, openVajraAi],
  );

  const toggleExpand = useCallback((controlId: string) => {
    if (expandedControl === controlId) {
      setExpandedControl(null);
      if (vajraAiControlId === controlId) {
        setVajraAiControlId(null);
      }
      return;
    }
    setExpandedControl(controlId);
  }, [expandedControl, vajraAiControlId]);

  const openControlVajraAi = useCallback((control: SecurityControl) => {
    setExpandedControl(control.id);
    if (vajraAiControlId === control.id) {
      setVajraAiControlId(null);
      return;
    }
    setVajraAiControlId(control.id);
    setVajraAiQuery('');
    setVajraAiReply(null);
    setVajraAiError(null);
  }, [vajraAiControlId]);

  return (
    <ConsentManagementGate
      title="Security Safeguards Hub"
      loading={loading || safeguards.loading}
      error={error ?? safeguards.error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="p-8 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="mb-2">Security Safeguards Hub</h1>
            <div className="flex items-center gap-3">
              <DPDPAChip
                sections={[
                  {
                    chapter: 2,
                    section: 8,
                    subsection: 5,
                    name: 'Reasonable security safeguards',
                    url: '/dpdpa2023/chapter-2/section8.html',
                    excerpt: 'Implement reasonable security safeguards...',
                  },
                  {
                    chapter: 2,
                    section: 8,
                    subsection: 7,
                    name: 'Erasure obligations',
                    url: '/dpdpa2023/chapter-2/section8.html',
                  },
                ]}
                size="detailed"
              />
              <PenaltyChip amount={summary?.penalty_worst_crores ?? 0} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!data}
              onClick={() => {
                if (!data) return;
                const fn = downloadSecurityEvidencePackPdf(data, orgName);
                notify(`Evidence pack saved as ${fn}`);
              }}
              className="px-4 py-2 text-sm rounded-md border border-[var(--border-strong)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] bg-transparent disabled:opacity-50"
            >
              Export evidence pack
            </button>
            <button
              type="button"
              disabled={!data}
              onClick={() => {
                if (!data) return;
                const fn = downloadSecurityAuditorReportPdf(data, orgName);
                notify(`Auditor report saved as ${fn}`);
              }}
              className="px-4 py-2 text-sm rounded-md bg-[var(--status-danger)] text-white hover:opacity-90 disabled:opacity-50"
            >
              Generate auditor report PDF
            </button>
          </div>
        </div>
        <SectionReference
          section="DPDPA Rule 6 — Section 8(5)"
          penalty={summary?.penalty_worst_crores ?? 0}
        />
      </div>

      {/* Hero Gauge */}
      <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-8 mb-6 text-[var(--text-primary)]">
        <div className="flex items-center gap-8">
          <ComplianceGauge score={summary?.score ?? 0} size="lg" />
          <div className="flex-1">
            <div className="mb-4">
              <div
                className={`text-2xl font-semibold mb-1 ${scoreLabelClass(summary?.score_label ?? 'Critical gap')}`}
              >
                {summary?.score_label ?? '—'}
              </div>
              <div className="text-[var(--text-secondary)]">
                {summary
                  ? `${summary.documented_count} of ${summary.total_controls} controls documented`
                  : 'Loading control coverage…'}
                {summary && summary.partial_count > 0
                  ? ` · ${summary.partial_count} partial · ${summary.missing_count} not started`
                  : null}
              </div>
              {posture ? (
                <div className="text-xs text-[var(--text-tertiary)] mt-1">
                  Live data · refreshed{' '}
                  {new Date(posture.computed_at).toLocaleString('en-IN', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-sm text-[var(--text-secondary)]">Current exposure:</div>
                <PenaltyChip amount={summary?.penalty_current_crores ?? 0} className="mt-1" />
              </div>
              <div className="text-[var(--text-tertiary)]">→</div>
              <div>
                <div className="text-sm text-[var(--text-secondary)]">If 0% score:</div>
                <PenaltyChip amount={summary?.penalty_worst_crores ?? 0} className="mt-1" />
              </div>
              {summary && summary.penalty_mitigated_crores > 0 ? (
                <>
                  <div className="text-[var(--text-tertiary)]">·</div>
                  <div>
                    <div className="text-sm text-[var(--text-secondary)]">Mitigated:</div>
                    <div className="text-sm font-medium text-[var(--status-success)] mt-1">
                      ₹{summary.penalty_mitigated_crores} Cr
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Control Cards */}
      <div className="space-y-4 mb-6">
        {controls.map((control) => {
          const isExpanded = expandedControl === control.id;
          const isVajraAiOpen = vajraAiControlId === control.id;

          return (
          <div
            key={control.id}
            className={`bg-[var(--surface-card)] rounded-lg border-2 p-6 transition-all text-[var(--text-primary)] ${
              control.status === 'documented'
                ? 'border-[var(--status-success)]/30'
                : control.status === 'partial'
                ? 'border-[var(--status-warning)]/30'
                : 'border-[var(--status-danger)]/30'
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="font-medium text-[var(--text-primary)]">{control.name}</h3>
                  {control.status === 'documented' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-success-bg)] text-[var(--status-success)] text-xs">
                      <Check className="size-3" />
                      Documented
                    </span>
                  )}
                  {control.status === 'partial' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-bg)] text-[var(--status-warning)] text-xs">
                      <AlertTriangle className="size-3" />
                      Partial {control.items_completed}/{control.items_total}
                    </span>
                  )}
                  {control.status === 'missing' && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] text-xs">
                      ❌ Not started
                    </span>
                  )}
                </div>

                {control.evidence && (
                  <div className="text-sm text-[var(--text-secondary)] mb-3">
                    Evidence: <span className="font-medium">{control.evidence}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="inline-flex h-9 items-stretch rounded-md border border-[var(--border-strong)] overflow-hidden bg-[var(--surface-card)]">
                  <button
                    type="button"
                    onClick={() => openControlVajraAi(control)}
                    className={`inline-flex items-center gap-1.5 px-3 text-sm whitespace-nowrap transition-colors ${
                      isVajraAiOpen
                        ? 'bg-violet-500/10 text-violet-700'
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <Sparkles className="size-3.5 text-violet-500" />
                    Ask Vajra AI
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleExpand(control.id)}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Collapse control details' : 'Expand control details'}
                    className={`inline-flex w-9 items-center justify-center border-l border-[var(--border-strong)] transition-colors ${
                      isExpanded
                        ? 'bg-[var(--surface-raised)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]'
                    }`}
                  >
                    <ChevronDown
                      className={`size-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {isExpanded ? (
              <div className="mt-4 space-y-4">
                {isVajraAiOpen ? (
              <div
                className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <Sparkles className="size-5 flex-shrink-0 text-violet-500" />
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                        Vajra AI — {control.name}
                      </h4>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">
                        {vajraAiStatus?.configured
                          ? 'Get tailored guidance for this control'
                          : 'Vajra AI is not configured — contact your administrator'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      openVajraAi(
                        vajraAiQuery ||
                          `How should ${orgName} document and improve "${control.name}" under DPDPA Section 8(5)?`,
                      )
                    }
                    className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 hover:opacity-90 bg-violet-500/10 text-violet-600"
                  >
                    Open Vajra AI →
                  </button>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void askVajraAi(vajraAiQuery, control);
                  }}
                  className="flex gap-2 mb-3"
                >
                  <input
                    type="text"
                    value={vajraAiControlId === control.id ? vajraAiQuery : ''}
                    onChange={(e) => setVajraAiQuery(e.target.value)}
                    placeholder={`e.g., "What evidence do we need for ${control.name}?"`}
                    disabled={vajraAiLoading}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border text-sm border-violet-500/30 text-[var(--text-primary)] bg-[var(--surface-raised)] disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={vajraAiLoading || !vajraAiQuery.trim()}
                    className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 hover:opacity-90 bg-violet-600 text-white disabled:opacity-50"
                  >
                    {vajraAiLoading ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Asking…
                      </span>
                    ) : (
                      'Ask'
                    )}
                  </button>
                </form>

                {vajraAiError ? <p className="text-sm text-amber-700 mb-3">{vajraAiError}</p> : null}

                {vajraAiReply ? (
                  <div className="mb-3 p-4 rounded-lg bg-[var(--surface-raised)] border border-violet-500/20">
                    <p className="text-xs font-medium text-violet-600 mb-2">Vajra AI</p>
                    <MarkdownMessage>{vajraAiReply}</MarkdownMessage>
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  {controlQuickPrompts(control, orgName).map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      disabled={vajraAiLoading}
                      onClick={() => void askVajraAi(prompt.query, control)}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-violet-500/30 text-violet-700 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
              </div>
                ) : null}

                <div className={isVajraAiOpen ? 'pt-4 border-t border-[var(--border-default)]' : undefined}>
                  <h4 className="text-sm font-medium text-[var(--text-primary)] mb-3">
                    Implementation checklist
                  </h4>
                  {control.checklist_items.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      {control.checklist_items.map((item, index) => {
                        const isDone = index < control.items_completed;
                        const isPending =
                          !isDone && control.status === 'partial' && index === control.items_completed;
                        return (
                          <div key={item} className="flex items-start gap-2">
                            {isDone ? (
                              <Check className="size-4 mt-0.5 flex-shrink-0 text-[var(--status-success)]" />
                            ) : isPending ? (
                              <XCircle className="size-4 mt-0.5 flex-shrink-0 text-[var(--status-warning)]" />
                            ) : (
                              <XCircle className="size-4 mt-0.5 flex-shrink-0 text-[var(--text-tertiary)]" />
                            )}
                            <span
                              className={
                                isDone
                                  ? 'flex-1 text-[var(--text-primary)]'
                                  : 'flex-1 text-[var(--text-secondary)]'
                              }
                            >
                              {item}
                            </span>
                            <SecurityChecklistInfoButton
                              controlKey={control.control_key}
                              itemIndex={index}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--text-secondary)]">
                      No checklist items defined for this control yet.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
          );
        })}
      </div>

      {certifications.length > 0 && (
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 mb-6 text-[var(--text-primary)]">
          <h3 className="font-medium mb-4">Security certifications & attestations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {certifications.map((cert) => (
              <div
                key={`${cert.name}-${cert.auditor_firm ?? 'org'}`}
                className="rounded-lg border border-[var(--border-default)] p-4"
              >
                <div className="font-medium">{cert.name}</div>
                <div className="text-sm text-[var(--text-secondary)] mt-1 capitalize">
                  Status: {cert.status}
                </div>
                {cert.auditor_firm ? (
                  <div className="text-sm text-[var(--text-secondary)]">Auditor: {cert.auditor_firm}</div>
                ) : null}
                {cert.valid_until ? (
                  <div className="text-sm text-[var(--text-secondary)]">
                    Valid until:{' '}
                    {new Date(cert.valid_until).toLocaleDateString('en-IN', { dateStyle: 'medium' })}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Real-time Security Posture */}
      {posture && (
        <div className="bg-[var(--surface-card)] rounded-lg border border-[var(--border-default)] p-6 text-[var(--text-primary)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-[var(--text-primary)]">Real-time Security Posture</h3>
            <span className="text-xs text-[var(--text-tertiary)]">
              Updated{' '}
              {new Date(posture.computed_at).toLocaleString('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <PostureMetricCard
              label="Failed logins (24h)"
              metric={posture.failed_logins_24h}
            />
            <PostureMetricCard
              label="Privileged sessions"
              metric={posture.privileged_sessions}
            />
            <PostureMetricCard
              label="Unencrypted assets"
              metric={posture.unencrypted_assets}
            />
            <PostureMetricCard
              label="MFA-bypass users"
              metric={posture.mfa_bypass_users}
            />
            <PostureMetricCard label="Anomalies" metric={posture.anomalies} />
          </div>
        </div>
      )}
    </div>
    </ConsentManagementGate>
  );
}
