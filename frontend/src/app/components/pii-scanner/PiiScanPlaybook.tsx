import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Database,
  Fingerprint,
  Globe,
  Loader2,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { fetchFindings, fetchPiiSummary } from '@/lib/api/piiScan';
import type { PiiFinding, PiiScanSummary } from '@/types/piiScan';

interface PiiScanPlaybookProps {
  onClose: () => void;
  orgId?: string;
}

const PREREQUISITES = [
  'At least one data source registered and connection-tested (Data Sources module).',
  'Admin or superadmin role — starting scans and dismissing findings requires elevated access.',
  'Purpose Registry populated so scanned fields can be reconciled against declared purposes.',
  'Retention Policies configured for sensitive data categories so scanned fields have a storage-limitation rule.',
];

const LIFECYCLE = [
  { label: 'Select source', icon: Database },
  { label: 'Sample values', icon: Search },
  { label: 'Detect & score', icon: Fingerprint },
  { label: 'Classify inventory', icon: ShieldCheck },
  { label: 'Review & dismiss', icon: Users },
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Run a scan against a registered source',
    detail:
      'Pick a database, cloud store, file bucket, REST API, or log source and a sample size (10–5000 rows/events per table). The scan reads real values — nothing in the source is modified.',
    icon: Search,
  },
  {
    step: 2,
    title: 'Values are detected, never guessed',
    detail:
      'Regex + checksum detectors (Aadhaar/PAN with digit-checksum validation, phone, email, IFSC, UPI, card numbers) run on structured columns; Presidio NER additionally finds names, locations, and demographics in free text/logs.',
    icon: Fingerprint,
  },
  {
    step: 3,
    title: 'A column is flagged at ≥30% match',
    detail:
      'If at least 30% of a column\u2019s non-null sampled values match one PII category, the column is flagged with a confidence score and a masked example — reducing false positives from mixed-content columns.',
    icon: Shield,
  },
  {
    step: 4,
    title: 'Data Inventory is auto-classified',
    detail:
      'Every finding upserts the matching Data Inventory asset/field, overwriting name-based guesses with a data-verified classification (personal/sensitive) and category, tagged classification_source = pii_scanner.',
    icon: Database,
  },
  {
    step: 5,
    title: 'Review, dismiss, and reconcile with compliance modules',
    detail:
      'A human reviewer confirms or dismisses each finding. Confirmed sensitive findings should then be checked against Purpose Registry (is it used for a declared purpose?) and Retention Policies (does it have a deletion rule?).',
    icon: ShieldCheck,
  },
];

const CHECKLIST = [
  'Every production data source has been scanned at least once',
  'No detected findings remain unreviewed for more than a sprint',
  'Sensitive findings are linked to a purpose in the Purpose Registry',
  'Sensitive findings sit under an active Retention Policy',
  'Findings on minors\u2019 data are tagged and handled per Sec 9 consent rules',
  'Cross-border findings have a recorded transfer mechanism (Sec 16)',
  'A recurring schedule exists for every business-critical source (Sec 10 continuous monitoring)',
];

const TROUBLESHOOTING = [
  {
    issue: 'Scan fails immediately',
    fix: 'Check the error on the scan row/drawer — usually a connection, credential, or unsupported source-type issue. Fix the source in Data Sources, then Retry.',
  },
  {
    issue: 'A column is flagged incorrectly',
    fix: 'Dismiss the finding — this reverts the Data Inventory field to unclassified. Adjust sample size or re-scan if the sample was unrepresentative.',
  },
  {
    issue: 'Findings never resolve to "used for a purpose"',
    fix: 'Map the underlying Data Inventory field to a Purpose in Consent Enforcement setup, or in the Data Inventory field detail.',
  },
  {
    issue: 'Sensitive data has no retention rule',
    fix: 'Create a Retention Policy scoped to that data source or asset in the Retention Policies module.',
  },
];

function PlaybookSection({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</h3>
      {children}
    </section>
  );
}

function GapStat({
  label,
  value,
  hint,
  warn,
}: {
  label: string;
  value: number;
  hint: string;
  warn?: boolean;
}): ReactElement {
  return (
    <div className="rounded-lg border border-[var(--border-default)] p-3">
      <div className={warn && value > 0 ? 'text-lg font-semibold text-[var(--status-danger)]' : 'text-lg font-semibold text-[var(--text-primary)]'}>
        {value}
      </div>
      <div className="text-xs font-medium text-[var(--text-primary)] mt-0.5">{label}</div>
      <div className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{hint}</div>
    </div>
  );
}

export function PiiScanPlaybook({ onClose, orgId }: PiiScanPlaybookProps): ReactElement {
  const [summary, setSummary] = useState<PiiScanSummary | null>(null);
  const [findings, setFindings] = useState<PiiFinding[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPiiSummary(orgId), fetchFindings(orgId, 'detected')])
      .then(([s, f]) => {
        setSummary(s);
        setFindings(f);
      })
      .catch(() => {
        setSummary(null);
        setFindings([]);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  const bySource = useMemo(() => {
    const map = new Map<string, { name: string; count: number; sensitive: number }>();
    for (const f of findings) {
      const key = f.data_source_id ?? 'unknown';
      const entry = map.get(key) ?? { name: f.data_source_name ?? 'Unknown source', count: 0, sensitive: 0 };
      entry.count += 1;
      if (f.classification === 'sensitive') entry.sensitive += 1;
      map.set(key, entry);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [findings]);

  const coveragePct =
    summary && summary.sources_scannable > 0
      ? Math.round((summary.sources_scanned / summary.sources_scannable) * 100)
      : null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-2xl flex flex-col bg-[var(--surface-card)] border-l border-[var(--border-default)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pii-scan-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-rose-600/10 to-orange-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-600/15 text-rose-700 dark:text-rose-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="pii-scan-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                PII Scanner Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                Value-level discovery engine — confirms what personal data actually lives in your sources,
                feeds Data Inventory classifications, and surfaces where DPDPA accountability gaps remain.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
              aria-label="Close playbook"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          <PlaybookSection title="What this module does">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                Heuristic, name-based classification (e.g. a column called <code>phone</code>) is a guess.
                PII Scanner samples <strong className="text-[var(--text-primary)]">real values</strong>, runs
                regex + checksum detectors and NER, and only then marks a field data-verified. That
                verified classification is what every other DPDPA module — Purpose mapping, Consent
                Enforcement, Retention, DSAR, RoPA — relies on being accurate.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Sec 4/5 — Purpose limitation',
                  'Sec 8(3) — Accuracy',
                  'Sec 8(5) — Security safeguards',
                  'Sec 8(7) — Storage limitation',
                  'Sec 9 — Children\u2019s data',
                  'Sec 10 — SDF continuous monitoring',
                  'Sec 16 — Cross-border transfer',
                ].map((chip) => (
                  <span
                    key={chip}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs"
                  >
                    <Scale className="size-3.5" /> {chip}
                  </span>
                ))}
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Roles & responsibilities">
            <div className="grid gap-3">
              {[
                {
                  role: 'DPO / Compliance',
                  icon: Scale,
                  tasks: 'Review sensitive findings, confirm purpose/retention linkage, sign off before promoting classifications.',
                },
                {
                  role: 'Data / Platform',
                  icon: Database,
                  tasks: 'Run and schedule scans, triage findings, dismiss false positives, keep source credentials healthy.',
                },
                {
                  role: 'Engineering',
                  icon: Shield,
                  tasks: 'Ensure new sources are registered and PII-scannable before shipping to production.',
                },
                {
                  role: 'Legal',
                  icon: Users,
                  tasks: 'Validate cross-border findings have a lawful transfer mechanism; review children\u2019s-data findings.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.role} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3 bg-[var(--surface)]">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rose-600/10 text-rose-600">
                      <Icon className="size-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[var(--text-primary)]">{item.role}</div>
                      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{item.tasks}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Prerequisites">
            <ul className="space-y-2">
              {PREREQUISITES.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <Circle className="size-4 shrink-0 mt-0.5 text-rose-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Scan lifecycle">
            <div className="flex flex-wrap items-center gap-2">
              {LIFECYCLE.map((stage, idx) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.label} className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 rounded-full border border-[var(--border-default)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]">
                      <Icon className="size-3.5 text-rose-600" />
                      {stage.label}
                    </div>
                    {idx < LIFECYCLE.length - 1 && <span className="text-[var(--text-tertiary)]">&rarr;</span>}
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="How detection works">
            <div className="space-y-3">
              {IMPLEMENTATION_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white text-sm font-bold">
                      {step.step}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-rose-600 shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Where this data flows (live)">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-4">
                  <Loader2 className="size-4 animate-spin" /> Loading usage map&hellip;
                </div>
              ) : (
                <>
                  <p className="text-xs text-[var(--text-secondary)]">
                    Every active finding upgrades the matching Data Inventory field. Coverage and
                    accountability gaps across your organization right now:
                  </p>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <GapStat
                      label="Source coverage"
                      value={coveragePct ?? 0}
                      hint={
                        summary
                          ? `${summary.sources_scanned}/${summary.sources_scannable} sources scanned${coveragePct !== null ? '%' : ''}`
                          : 'No data'
                      }
                    />
                    <GapStat
                      label="No purpose link"
                      value={summary?.findings_without_purpose ?? 0}
                      hint="Findings not mapped to a Purpose"
                      warn
                    />
                    <GapStat
                      label="No retention rule"
                      value={summary?.findings_without_retention ?? 0}
                      hint="Findings with no Retention Policy"
                      warn
                    />
                    <GapStat
                      label="Children's data"
                      value={summary?.children_data_findings ?? 0}
                      hint="Findings tied to a minor (Sec 9)"
                      warn
                    />
                  </div>

                  {summary && summary.cross_border_findings > 0 && (
                    <div className="flex items-center gap-2 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs text-[var(--status-warning)]">
                      <Globe className="size-3.5 shrink-0" />
                      {summary.cross_border_findings} finding(s) sit on data sources/assets flagged for
                      cross-border transfer — confirm a lawful transfer mechanism (Sec 16).
                    </div>
                  )}

                  {bySource.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">By data source</div>
                      <ul className="space-y-1.5">
                        {bySource.map((s) => (
                          <li
                            key={s.name}
                            className="flex justify-between gap-2 rounded-md border border-[var(--border-default)] px-3 py-2"
                          >
                            <span className="font-medium text-[var(--text-primary)]">{s.name}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              {s.count} finding(s) &middot; {s.sensitive} sensitive
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {bySource.length === 0 && (
                    <p className="text-xs text-[var(--text-tertiary)] py-2">
                      No active findings yet. Run a scan to populate this usage map.
                    </p>
                  )}

                  {summary && summary.running_scans > 0 && (
                    <div className="flex items-center gap-2 text-xs text-[var(--status-info)]">
                      <Clock className="size-3.5" /> {summary.running_scans} scan(s) currently running.
                    </div>
                  )}
                </>
              )}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Go-live checklist">
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--status-success)]" />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Troubleshooting">
            <div className="space-y-2">
              {TROUBLESHOOTING.map((row) => (
                <div key={row.issue} className="rounded-lg border border-[var(--border-default)] p-3 text-sm">
                  <div className="font-medium text-[var(--text-primary)]">{row.issue}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">{row.fix}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-2 mt-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[var(--status-warning)]" />
              A scan samples a subset of rows/events — it raises confidence, but does not replace a full
              audit for regulatory evidence. Schedule recurring scans on production sources.
            </p>
          </PlaybookSection>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--border-default)] flex justify-end bg-[var(--surface-raised)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-card)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
