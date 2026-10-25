import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { useComplianceMap } from '@/hooks/useComplianceMap';
import { downloadComplianceMapPdf } from '@/lib/compliance/complianceMapPdf';
import type { ComplianceMapSectionDetail } from '@/types/compliance';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownMessage } from '@/app/components/common/MarkdownMessage';
import { featureRouteToPath } from '@/lib/compliance/featureRoutes';
import { fetchShieldAiStatus, shieldAiChat, type ShieldAiStatus } from '@/lib/api/shieldAi';
import { fetchComplianceMapCrosswalk, type FrameworkCrosswalkResponse } from '@/lib/api/compliance';
import { ApiError } from '@/lib/api/client';

const FEATURE_STATUS_LABELS: Record<string, string> = {
  evidence_backed: 'Evidence backed',
  configured: 'Configured',
  documented_only: 'Documented only',
  not_available: 'Not available',
  implemented: 'Implemented',
};

function featureStatusIcon(status: string) {
  if (status === 'evidence_backed' || status === 'implemented') {
    return <Check className="w-5 h-5 flex-shrink-0 text-[var(--status-success)]" strokeWidth={2} />;
  }
  if (status === 'configured') {
    return <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--status-warning)]" strokeWidth={2} />;
  }
  if (status === 'not_available') {
    return <X className="w-5 h-5 flex-shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} />;
  }
  return <AlertTriangle className="w-5 h-5 flex-shrink-0 text-[var(--status-warning)]" strokeWidth={2} />;
}

interface MappedFeature {
  name: string;
  status: string;
  lastVerified: string;
  evidenceCount: number;
  route: string;
}

interface SectionDetail {
  title: string;
  statute: string;
  features: MappedFeature[];
  penalty: string;
}

const SECTION_DETAILS: Record<string, SectionDetail> = {
  '2-6': {
    title: 'Section 6 — Consent',
    statute: `(1) A Data Fiduciary shall obtain consent of the Data Principal for processing personal data where such personal data is not processed on the grounds referred to in section 7.

(2) The Data Fiduciary shall provide, to the Data Principal, the option to—
  (a) give, manage, review and withdraw consent for every purpose for which consent is sought;
  (b) withdraw consent with the same ease as it is given.

(3) The consent shall be free, specific, informed, unconditional and unambiguous with a clear affirmative action, and shall signify an agreement to the processing of personal data for the specified purpose...`,
    features: [
      { name: 'Consent Notices Manager', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 47, route: 'consent-notices-manager' },
      { name: 'Notice Builder', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 23, route: 'banner-builder' },
      { name: 'Purpose Registry', status: 'implemented', lastVerified: '2026-05-25', evidenceCount: 18, route: 'purpose-registry-new' },
      { name: 'Consent Withdrawal Flow', status: 'implemented', lastVerified: '2026-05-27', evidenceCount: 34, route: 'consent-withdrawal-flow' },
      { name: 'Cookie & Tracker Manager', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 42, route: 'cookie-tracker-manager' },
      { name: 'Multi-Language Editor', status: 'implemented', lastVerified: '2026-05-26', evidenceCount: 22, route: 'multi-language-editor' },
      { name: 'Consent Manager Integration', status: 'implemented', lastVerified: '2026-05-24', evidenceCount: 15, route: 'consent-manager-integration' },
      { name: 'Notice Delivery Channels', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 19, route: 'notice-delivery-channels' },
      { name: 'Proof Vault (consent logs)', status: 'implemented', lastVerified: '2026-05-29', evidenceCount: 56, route: 'proof-vault' },
      { name: 'Audit Log (consent events)', status: 'implemented', lastVerified: '2026-05-29', evidenceCount: 89, route: 'audit-log' },
      { name: 'Banner Builder (granular toggles)', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 31, route: 'banner-builder' },
      { name: 'A/B Testing Module', status: 'implemented', lastVerified: '2026-05-20', evidenceCount: 12, route: 'banner-builder' },
      { name: 'Consent Persistence Configuration', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 8, route: 'banner-builder' },
      { name: 'Webhook Integration (consent events)', status: 'implemented', lastVerified: '2026-05-25', evidenceCount: 14, route: 'banner-builder' },
      { name: 'Developer Mode API', status: 'implemented', lastVerified: '2026-05-22', evidenceCount: 7, route: 'deployment-settings' },
      { name: 'Geo-targeting (consent per region)', status: 'implemented', lastVerified: '2026-05-21', evidenceCount: 9, route: 'banner-builder' },
      { name: 'Rights Portal (withdrawal)', status: 'implemented', lastVerified: '2026-05-29', evidenceCount: 26, route: 'data-rights-portal-public' },
      { name: 'Section 6(3) Parity Enforcement', status: 'implemented', lastVerified: '2026-05-28', evidenceCount: 5, route: 'banner-builder' },
    ],
    penalty: '₹150 Cr per occurrence',
  },
};

/**
 * Statutory compliance map linking DPDPA sections to ZeroShield features.
 */
export function DPDPAComplianceMap(): ReactElement {
  const navigate = useNavigate();
  const {
    summary,
    chapters,
    loadSection,
    orgName,
    loading,
    error,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    orgIdParam,
  } = useComplianceMap();
  const [expandedChapters, setExpandedChapters] = useState<number[]>([]);
  const [selectedSection, setSelectedSection] = useState('2-6');
  const [auditorMode, setAuditorMode] = useState(false);
  const [detail, setDetail] = useState<ComplianceMapSectionDetail | null>(null);
  const [shieldAiQuery, setShieldAiQuery] = useState('');
  const [shieldAiReply, setShieldAiReply] = useState<string | null>(null);
  const [shieldAiLoading, setShieldAiLoading] = useState(false);
  const [shieldAiError, setShieldAiError] = useState<string | null>(null);
  const [shieldAiStatus, setShieldAiStatus] = useState<ShieldAiStatus | null>(null);
  const [frameworkOverlay, setFrameworkOverlay] = useState<'none' | 'rbi' | 'iso27001' | 'nist'>('none');
  const [crosswalk, setCrosswalk] = useState<FrameworkCrosswalkResponse | null>(null);

  const apiChapters = chapters.data ?? [];
  const mapSummary = summary.data;

  useEffect(() => {
    if (!hasOrg) return;
    void loadSection(selectedSection).then(setDetail).catch(() => setDetail(null));
  }, [hasOrg, selectedSection, loadSection]);

  useEffect(() => {
    if (!hasOrg) return;
    void fetchShieldAiStatus()
      .then(setShieldAiStatus)
      .catch(() => setShieldAiStatus({ configured: false, model_id: null, region: null }));
  }, [hasOrg]);

  useEffect(() => {
    if (!hasOrg || frameworkOverlay === 'none') {
      setCrosswalk(null);
      return;
    }
    void fetchComplianceMapCrosswalk(frameworkOverlay, orgIdParam ?? undefined)
      .then(setCrosswalk)
      .catch(() => setCrosswalk(null));
  }, [hasOrg, frameworkOverlay, orgIdParam]);

  const activeCrosswalkSection = crosswalk?.sections.find((s) => s.section_key === selectedSection);

  useEffect(() => {
    setShieldAiQuery('');
    setShieldAiReply(null);
    setShieldAiError(null);
  }, [selectedSection]);

  const toggleChapter = (chapter: number): void => {
    setExpandedChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter],
    );
  };

  const selectSection = (sectionKey: string, chapterNumber: number): void => {
    setSelectedSection(sectionKey);
    setExpandedChapters((prev) => (prev.includes(chapterNumber) ? prev : [...prev, chapterNumber]));
  };

  const openFeature = (route: string): void => {
    navigate(featureRouteToPath(route));
  };

  const openShieldAi = (query: string): void => {
    navigate('/ai/copilot', { state: { query } });
  };

  const handleExport = () => {
    if (!mapSummary || !detail) return;
    const fn = downloadComplianceMapPdf(mapSummary, apiChapters, detail, orgName);
    notify(`Compliance map saved as ${fn}`);
  };

  const displayDetail = detail ?? {
    section_key: '2-6',
    title: 'Section 6 — Consent',
    statute: SECTION_DETAILS['2-6'].statute,
    features: SECTION_DETAILS['2-6'].features.map((f) => ({
      ...f,
      last_verified: f.lastVerified,
      evidence_count: f.evidenceCount,
    })),
    penalty: SECTION_DETAILS['2-6'].penalty,
  };

  const selectedSectionMeta = useMemo(
    () =>
      apiChapters
        .flatMap((ch) => ch.sections.map((s) => ({ ...s, chapter: ch.number })))
        .find((s) => s.section_key === selectedSection),
    [apiChapters, selectedSection],
  );

  const sectionReferenceLabel = useMemo(() => {
    const chapter = selectedSectionMeta?.chapter ?? (Number(selectedSection.split('-')[0]) || 2);
    const sectionNum =
      selectedSectionMeta?.number?.split('-')[0] ??
      (selectedSection.split('-').slice(1).join('-') || '6');
    const name = selectedSectionMeta?.title ?? displayDetail.title.replace(/^Section \d+ — /, '');
    return `Ch.${chapter} §${sectionNum} — ${name}`;
  }, [selectedSectionMeta, selectedSection, displayDetail.title]);

  const sectionShortLabel = useMemo(() => {
    if (selectedSectionMeta) {
      return `§${selectedSectionMeta.number} ${selectedSectionMeta.title}`;
    }
    return displayDetail.title;
  }, [selectedSectionMeta, displayDetail.title]);

  const shieldAiContext = useMemo(() => {
    const featureLines = displayDetail.features
      .slice(0, 15)
      .map((f) => `- ${f.name} (${f.evidence_count} evidence items)`);
    return [
      `Organization: ${orgName}`,
      orgIdParam ? `Organization ID: ${orgIdParam}` : null,
      `DPDPA section: ${displayDetail.title}`,
      `Section key: ${selectedSection}`,
      displayDetail.penalty ? `Maximum penalty: ${displayDetail.penalty}` : null,
      featureLines.length ? `Mapped ZeroShield features:\n${featureLines.join('\n')}` : null,
      `Statute excerpt:\n${displayDetail.statute.slice(0, 1000)}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }, [orgName, orgIdParam, displayDetail, selectedSection]);

  const shieldAiQuickPrompts = useMemo(
    () => [
      {
        label: `Show me ${sectionShortLabel} gaps`,
        query: `What compliance gaps exist for ${orgName} under DPDPA ${sectionShortLabel}? List specific missing controls or evidence.`,
      },
      {
        label: `Explain ${sectionShortLabel} requirements`,
        query: `Explain the key DPDPA requirements in ${sectionShortLabel} and how the mapped ZeroShield features help satisfy them.`,
      },
      {
        label: `Generate ${sectionShortLabel} evidence pack`,
        query: `Generate a practical audit evidence pack checklist for demonstrating compliance with DPDPA ${sectionShortLabel} for ${orgName}.`,
      },
    ],
    [sectionShortLabel, orgName],
  );

  const askShieldAi = async (query: string): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (!shieldAiStatus?.configured) {
      notify('Shield AI is not configured. Please contact your administrator.');
      openShieldAi(trimmed);
      return;
    }

    setShieldAiLoading(true);
    setShieldAiError(null);
    setShieldAiReply(null);
    setShieldAiQuery(trimmed);

    try {
      const { reply } = await shieldAiChat([{ role: 'user', content: trimmed }], shieldAiContext);
      setShieldAiReply(reply);
    } catch (err) {
      setShieldAiError(
        err instanceof ApiError ? err.message : 'Could not reach Shield AI. Please try again.',
      );
    } finally {
      setShieldAiLoading(false);
    }
  };

  return (
    <ConsentManagementGate
      title="DPDPA Compliance Map"
      loading={loading || summary.loading || chapters.loading}
      error={error ?? summary.error ?? chapters.error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="flex-1 overflow-y-auto">
      <div className="p-8">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-semibold mb-2 text-[var(--text-primary)]">DPDPA 2023 Compliance Map</h1>
              <p className="text-base text-[var(--text-secondary)]">
                Every ZeroShield feature mapped to its statutory anchor
              </p>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={frameworkOverlay}
                onChange={(e) => setFrameworkOverlay(e.target.value as typeof frameworkOverlay)}
                className="px-3 py-2 rounded-lg text-sm border border-[var(--border-default)] bg-[var(--surface-raised)]"
                title="Read-only overlay — DPDPA score unchanged"
              >
                <option value="none">DPDPA only</option>
                <option value="rbi">+ RBI overlay</option>
                <option value="iso27001">+ ISO 27001 overlay</option>
                <option value="nist">+ NIST CSF overlay</option>
              </select>
              <div className="text-sm text-[var(--text-tertiary)]">
                Last reviewed:{' '}
                <strong>
                  {mapSummary?.last_reviewed_at
                    ? new Date(mapSummary.last_reviewed_at).toLocaleDateString('en-IN')
                    : 'Not yet reviewed'}
                </strong>
              </div>
              <button
                type="button"
                onClick={handleExport}
                disabled={!mapSummary}
                className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-90 bg-[var(--brand-primary)] text-white disabled:opacity-50"
              >
                <Download className="w-4 h-4" strokeWidth={1.5} />
                Export mapping (PDF)
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="p-6 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-default)]">
            <div className="text-sm mb-2 text-[var(--text-secondary)]">Total statutory sections covered</div>
            <div className="flex items-baseline gap-2 mb-1">
              <div className="text-3xl font-semibold text-[var(--text-primary)]">{mapSummary?.sections_covered ?? '—'}</div>
              <div className="text-lg text-[var(--text-tertiary)]">of {mapSummary?.sections_in_scope ?? mapSummary?.sections_total ?? '—'} in scope</div>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--status-success)]">
              <Check className="w-4 h-4" strokeWidth={2} />
              {mapSummary?.coverage_percent ?? 0}% evidence-backed coverage
            </div>
            {(mapSummary?.sections_partial ?? 0) > 0 && (
              <div className="text-xs text-[var(--text-tertiary)] mt-1">
                {mapSummary?.sections_partial} partial · {mapSummary?.sections_documented_only} documented-only
              </div>
            )}
          </div>

          <div className="p-6 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-default)]">
            <div className="text-sm mb-2 text-[var(--text-secondary)]">Features mapped</div>
            <div className="text-3xl font-semibold mb-1 text-[var(--text-primary)]">{mapSummary?.features_mapped ?? '—'}</div>
            <div className="text-sm text-[var(--text-tertiary)]">Across all modules</div>
          </div>

          <div className="p-6 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-default)]">
            <div className="text-sm mb-2 text-[var(--text-secondary)]">DPDPA Compliance Score</div>
            <div className="flex items-center gap-3 mb-1">
              <div className="text-3xl font-semibold text-[var(--text-primary)]">{mapSummary?.compliance_score ?? '—'}</div>
              <div className="text-lg text-[var(--text-tertiary)]">/ 100</div>
            </div>
            <div className="w-full h-2 rounded-full bg-[var(--surface-raised)]">
              <div className="h-full rounded-full bg-[var(--status-success)]" style={{ width: `${mapSummary?.compliance_score ?? 0}%` }} />
            </div>
          </div>

          <div className="p-6 rounded-xl bg-[var(--surface-primary)] border border-[var(--border-default)]">
            <div className="text-sm mb-2 text-[var(--text-secondary)]">Penalty exposure mitigated</div>
            <div className="text-3xl font-semibold mb-1 text-[var(--text-primary)]">₹{mapSummary?.penalty_mitigated_crores ?? '—'} Cr</div>
            <div className="text-sm text-[var(--text-tertiary)]">of ₹{mapSummary?.penalty_worst_crores ?? 250} Cr total</div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-4">
            <div className="rounded-xl p-6 bg-[var(--surface-primary)] border border-[var(--border-default)]">
              <div className="flex items-center gap-2 mb-4">
                <Scale className="w-5 h-5 text-[var(--brand-primary)]" strokeWidth={1.5} />
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">DPDPA Chapter Tree</h3>
              </div>

              <div className="space-y-2">
                {apiChapters.map((chapter) => (
                  <div key={chapter.number}>
                    <button
                      type="button"
                      onClick={() => toggleChapter(chapter.number)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-raised)] text-[var(--text-primary)]"
                    >
                      <div className="flex items-center gap-2">
                        {expandedChapters.includes(chapter.number) ? (
                          <ChevronDown className="w-4 h-4" strokeWidth={1.5} />
                        ) : (
                          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
                        )}
                        <span>
                          Chapter {chapter.number}: {chapter.title}
                        </span>
                      </div>
                    </button>

                    {expandedChapters.includes(chapter.number) ? (
                      <div className="ml-6 mt-1 space-y-1">
                        {chapter.sections.map((section) => {
                          const sectionKey = section.section_key;
                          return (
                            <button
                              key={sectionKey}
                              type="button"
                              onClick={() => selectSection(sectionKey, chapter.number)}
                              className={cn(
                                'w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors',
                                selectedSection === sectionKey ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]' : 'hover:bg-[var(--surface-raised)]',
                              )}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {section.status === 'covered' ? (
                                  <Check className="w-3 h-3 flex-shrink-0 text-[var(--status-success)]" strokeWidth={2} />
                                ) : null}
                                {section.status === 'partial' ? (
                                  <AlertTriangle className="w-3 h-3 flex-shrink-0 text-[var(--status-warning)]" strokeWidth={2} />
                                ) : null}
                                {section.status === 'na' ? (
                                  <X className="w-3 h-3 flex-shrink-0 text-[var(--text-tertiary)]" strokeWidth={2} />
                                ) : null}
                                <span className="truncate text-[var(--text-secondary)]">
                                  §{section.number} {section.title}
                                </span>
                              </div>
                              {section.feature_count > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 bg-[#F5F5F4] text-[var(--text-tertiary)]">
                                  {section.feature_count}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="col-span-8 space-y-6">
            <div className="rounded-xl p-6 bg-[var(--surface-primary)] border border-[var(--border-default)]">
              <div className="mb-4">
                <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-3">{displayDetail.title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-indigo-50 border border-indigo-200 text-indigo-800">
                    <Scale className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
                    {sectionReferenceLabel}
                  </span>
                  {activeCrosswalkSection && activeCrosswalkSection.controls.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 border border-amber-200 text-amber-900">
                      {crosswalk?.framework_label}: {activeCrosswalkSection.controls.join(', ')}
                    </span>
                  )}
                </div>
              </div>

              {activeCrosswalkSection && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50/50 border border-amber-200/60 text-sm text-amber-950">
                  <strong>{crosswalk?.framework_label} crosswalk (read-only):</strong>{' '}
                  Maps DPDPA {activeCrosswalkSection.dpdpa_section} to controls{' '}
                  {activeCrosswalkSection.controls.join(', ')} — {activeCrosswalkSection.evidence_count} live evidence items.
                </div>
              )}

              <div className="flex justify-end mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={auditorMode}
                    onChange={(e) => setAuditorMode(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Auditor view</span>
                </label>
              </div>

              <div className="p-4 rounded-lg mb-6 bg-[var(--surface-raised)] border border-[var(--border-default)] font-serif">
                <div className="text-sm whitespace-pre-line text-[var(--text-primary)] leading-relaxed">{displayDetail.statute}</div>
              </div>
            </div>

            <div className="rounded-xl p-6 bg-[var(--surface-primary)] border border-[var(--border-default)]">
              <h3 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">
                How ZeroShield satisfies this section
              </h3>

              <div className="space-y-3">
                {displayDetail.features.map((feature, idx) => (
                  <div
                    key={feature.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => openFeature(feature.route)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openFeature(feature.route);
                      }
                    }}
                    className="flex items-center justify-between p-4 rounded-lg hover:bg-[var(--surface-raised)] transition-colors border border-[var(--border-default)] cursor-pointer"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {featureStatusIcon(feature.status)}
                      <div className="flex-1">
                        <div className="text-sm font-medium mb-1 text-[var(--text-primary)]">{feature.name}</div>
                        <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                          <span>{FEATURE_STATUS_LABELS[feature.status] ?? feature.status}</span>
                          <span>•</span>
                          <span>Last verified: {feature.last_verified ?? '—'}</span>
                          <span>•</span>
                          <span>{feature.evidence_count} evidence items</span>
                          {auditorMode ? (
                            <>
                              <span>•</span>
                              <span className="font-mono">AUD-{idx + 1243}</span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openFeature(feature.route);
                      }}
                      className="px-3 py-1 rounded-lg text-xs font-medium hover:opacity-90 ml-3 bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-primary)] cursor-pointer shrink-0"
                    >
                      Open feature →
                    </button>
                  </div>
                ))}
              </div>
            </div>


            <div className="rounded-xl p-6 bg-violet-500/5 border border-violet-500/20">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Sparkles className="w-6 h-6 flex-shrink-0 text-violet-500" strokeWidth={1.5} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Ask Shield AI about {sectionShortLabel}
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1">
                      {shieldAiStatus?.configured
                        ? 'Get tailored guidance for this section'
                        : 'Shield AI is not configured — contact your administrator'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openShieldAi(
                      shieldAiQuery ||
                        `How does ${orgName} comply with DPDPA ${sectionShortLabel}, and what gaps remain?`,
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 hover:opacity-90 bg-violet-500/10 text-violet-600 cursor-pointer"
                >
                  Open Shield AI →
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void askShieldAi(shieldAiQuery);
                }}
                className="flex gap-2 mb-3"
              >
                <input
                  type="text"
                  value={shieldAiQuery}
                  onChange={(e) => setShieldAiQuery(e.target.value)}
                  placeholder={`e.g., "Are we DPDPA ${sectionShortLabel} compliant?"`}
                  disabled={shieldAiLoading}
                  className="flex-1 min-w-0 px-4 py-2 rounded-lg border text-sm border-violet-500/30 text-[var(--text-primary)] bg-[var(--surface-raised)] disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={shieldAiLoading || !shieldAiQuery.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 hover:opacity-90 bg-violet-600 text-white disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {shieldAiLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Asking…
                    </span>
                  ) : (
                    'Ask'
                  )}
                </button>
              </form>

              {shieldAiError ? (
                <p className="text-sm text-amber-700 mb-3">{shieldAiError}</p>
              ) : null}

              {shieldAiReply ? (
                <div className="mb-3 p-4 rounded-lg bg-[var(--surface-raised)] border border-violet-500/20">
                  <p className="text-xs font-medium text-violet-600 mb-2">Shield AI</p>
                  <MarkdownMessage>{shieldAiReply}</MarkdownMessage>
                  <button
                    type="button"
                    onClick={() => openShieldAi(shieldAiQuery)}
                    className="mt-3 text-xs font-medium text-violet-600 hover:underline cursor-pointer"
                  >
                    Continue in Shield AI →
                  </button>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {shieldAiQuickPrompts.map((prompt) => (
                  <button
                    key={prompt.label}
                    type="button"
                    disabled={shieldAiLoading}
                    onClick={() => void askShieldAi(prompt.query)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 bg-violet-500/10 text-violet-500 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {prompt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ConsentManagementGate>
  );
}
