import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  Globe,
  Loader2,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { fetchAnonymisationJobs, fetchAnonymisationSummary } from '@/lib/api/anonymisation';
import { fetchAssetUsage, fetchAssets } from '@/lib/api/dataInventory';
import type { AnonymisationJob, AnonymisationSummary } from '@/types/anonymisation';
import type { AssetUsageMap, InventoryAsset } from '@/types/dataInventory';
import {
  DE_IDENTIFICATION_TECHNIQUES,
  TRUE_ANONYMISATION_TECHNIQUES,
} from '@/lib/anonymisation/techniqueTaxonomy';
import { TECHNIQUE_LABELS } from '@/types/anonymisation';

interface DataAnonymisationPlaybookProps {
  onClose: () => void;
  orgId?: string;
}

const PREREQUISITES = [
  'Data source registered and schema imported into Data Inventory.',
  'PII Scanner run — fields classified as personal/sensitive before job creation.',
  'Declared business purpose and output recipient documented before export.',
  'For external sharing: processor DPA and cross-border transfer review completed.',
  'Understand this module produces analytics/export copies — not in-place retention remediation.',
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Identify the dataset',
    detail:
      'Select a Data Inventory asset backed by a readable database table or uploaded file. File/API sources that cannot be masked in place should be routed here.',
    icon: Database,
  },
  {
    step: 2,
    title: 'Choose the right technique class',
    detail:
      'Use irreversible anonymisation (k/l-diversity, suppression) for analytics exports intended to leave DPDPA scope. De-identification techniques require legal review.',
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: 'Preview re-identification risk',
    detail:
      'Run the live risk preview before committing. Adjust field plan roles/treatments until predicted k meets your threshold.',
    icon: Shield,
  },
  {
    step: 4,
    title: 'Record governance context',
    detail:
      'Capture business purpose, output recipient, and whether data leaves the organisation or crosses borders. This flows into the evidence pack and Proof Vault.',
    icon: Scale,
  },
  {
    step: 5,
    title: 'Export with audit trail',
    detail:
      'Completed jobs seal to Proof Vault. Every CSV download requires a justification (purpose + recipient) logged to the audit trail.',
    icon: CheckCircle2,
  },
  {
    step: 6,
    title: 'Monitor drift',
    detail:
      'Re-check completed datasets when source data changes. Drift flags mean you should re-anonymise before reusing the export.',
    icon: AlertTriangle,
  },
];

const DECISION_MATRIX = [
  {
    action: 'Anonymise (export)',
    when: 'Analytics, ML training, research — need irreversible de-linking from data principals',
    sec: '8(5)',
    module: 'This module',
  },
  {
    action: 'Mask (in place)',
    when: 'Live databases, non-prod clones, Sec 8(5) safeguards on operational systems',
    sec: '8(5)',
    module: 'Data Masking',
  },
  {
    action: 'Delete / retention',
    when: 'Purpose fulfilled, withdrawal, or storage limitation — preferred when feasible',
    sec: '8(7) / 11',
    module: 'Retention Policies',
  },
  {
    action: 'Pseudonymize (DSAR)',
    when: 'Data principal anonymization request with legal retention carve-outs',
    sec: '11',
    module: 'DSAR / Retention',
  },
];

const CHECKLIST = [
  'Dataset fields classified via PII Scanner or manual review',
  'Technique class matches intended legal outcome (irreversible vs de-identification)',
  'Business purpose and output recipient recorded on the job',
  'Risk preview shows k at or above organisational threshold',
  'External sharing reviewed against processor / cross-border policies',
  'Download justification workflow understood by data consumers',
  'Drift monitor scheduled or manually re-checked after source changes',
];

const TROUBLESHOOTING = [
  {
    issue: 'No datasets in job wizard',
    fix: 'Connect a database or upload a file in Data Sources, import schema to Data Inventory, then re-open the job form.',
  },
  {
    issue: 'All records suppressed — empty output',
    fix: 'Lower k threshold, reduce quasi-identifiers in the field plan, or use a larger dataset so equivalence classes can form.',
  },
  {
    issue: 'Drift detected on completed job',
    fix: 'Source data changed since export. Re-run the job or create a new scheduled recurring export.',
  },
  {
    issue: 'Withdrawal / DSAR not triggering this module',
    fix: 'Expected — withdrawal remediation uses Retention + Masking in-place. This module is for governed analytics exports only.',
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

export function DataAnonymisationPlaybook({ onClose, orgId }: DataAnonymisationPlaybookProps): ReactElement {
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [jobs, setJobs] = useState<AnonymisationJob[]>([]);
  const [summary, setSummary] = useState<AnonymisationSummary | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [usage, setUsage] = useState<AssetUsageMap | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAssets(orgId), fetchAnonymisationJobs(orgId), fetchAnonymisationSummary(orgId)])
      .then(([a, j, s]) => {
        setAssets(a.filter((x) => x.field_count > 0));
        setJobs(j);
        setSummary(s);
      })
      .catch(() => {
        setAssets([]);
        setJobs([]);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => {
    if (!selectedAssetId) {
      setUsage(null);
      return;
    }
    setLoadingUsage(true);
    fetchAssetUsage(selectedAssetId, orgId)
      .then(setUsage)
      .catch(() => setUsage(null))
      .finally(() => setLoadingUsage(false));
  }, [selectedAssetId, orgId]);

  const exportableAssets = useMemo(
    () => assets.filter((a) => a.personal_field_count > 0 || a.sensitive_field_count > 0),
    [assets],
  );

  const recentOutputs = useMemo(
    () =>
      jobs
        .filter((j) => j.status === 'completed')
        .slice(0, 5)
        .map((j) => ({
          id: j.id,
          name: j.name,
          dataset: j.dataset_name,
          recipient: j.output_recipient,
          destination: j.output_destination,
          technique: j.technique,
        })),
    [jobs],
  );

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
        aria-labelledby="anon-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-indigo-600/10 to-violet-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="anon-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                Data Anonymisation Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                Governed analytics/export de-identification — create irreversible copies for ML, research, and
                reporting while tracing where data flows and who accesses it.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-raised)]">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          <PlaybookSection title="What this module does (and does not)">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                <strong className="text-[var(--text-primary)]">Does:</strong> export anonymised/de-identified CSV
                copies with k-anonymity risk scoring, Proof Vault sealing, and download audit.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Does not:</strong> replace in-place masking,
                retention deletion, or DSAR/withdrawal remediation — those use{' '}
                <Link to="/data/masking" className="text-[var(--brand-primary)] hover:underline">
                  Data Masking
                </Link>{' '}
                and{' '}
                <Link to="/data/retention" className="text-[var(--brand-primary)] hover:underline">
                  Retention Policies
                </Link>
                .
              </p>
              <div className="flex flex-wrap gap-2">
                {['Sec 8(5) — Safeguards', 'Sec 8(7) — Minimisation context', 'Sec 6(10) — Proof', 'Analytics export'].map(
                  (chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs"
                    >
                      <Scale className="size-3.5" /> {chip}
                    </span>
                  ),
                )}
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Technique classes">
            <div className="grid gap-3">
              <div className="rounded-lg border border-[var(--status-success)]/40 bg-[var(--status-success-bg)] p-3">
                <div className="text-sm font-medium text-[var(--text-primary)]">Irreversible anonymisation</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">
                  {TRUE_ANONYMISATION_TECHNIQUES.map((t) => TECHNIQUE_LABELS[t]).join(', ')} — intended to remove
                  re-identification risk when correctly applied.
                </div>
              </div>
              <div className="rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)] p-3">
                <div className="text-sm font-medium text-[var(--text-primary)]">De-identification (legal review)</div>
                <div className="text-xs text-[var(--text-secondary)] mt-1">
                  {DE_IDENTIFICATION_TECHNIQUES.map((t) => TECHNIQUE_LABELS[t]).join(', ')} — may still be personal
                  data under DPDPA.
                </div>
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Roles & responsibilities">
            <div className="grid gap-3">
              {[
                {
                  role: 'DPO / Compliance',
                  icon: Scale,
                  tasks: 'Approve external sharing, choose technique class, sign off on k thresholds.',
                },
                {
                  role: 'Data / Analytics',
                  icon: Database,
                  tasks: 'Define business purpose, configure field plan, consume exports responsibly.',
                },
                {
                  role: 'Platform / Engineering',
                  icon: Shield,
                  tasks: 'Connect sources, schedule recurring exports, wire S3 destinations.',
                },
                {
                  role: 'Legal',
                  icon: Users,
                  tasks: 'Review cross-border transfers and processor agreements before external recipient types.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.role} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-600">
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
                  <Circle className="size-4 shrink-0 mt-0.5 text-indigo-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Implementation steps">
            <div className="space-y-3">
              {IMPLEMENTATION_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white text-sm font-bold">
                      {step.step}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-indigo-600" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Anonymise vs mask vs delete">
            <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                    <th className="text-left py-2 px-3">Action</th>
                    <th className="text-left py-2 px-3">When to use</th>
                    <th className="text-left py-2 px-3">Module</th>
                    <th className="text-left py-2 px-3">DPDPA</th>
                  </tr>
                </thead>
                <tbody>
                  {DECISION_MATRIX.map((row) => (
                    <tr key={row.action} className="border-t border-[var(--border-default)]">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{row.action}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{row.when}</td>
                      <td className="py-2 px-3 text-[var(--text-tertiary)]">{row.module}</td>
                      <td className="py-2 px-3 text-[var(--text-tertiary)]">{row.sec}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Data usage map (live)">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <Loader2 className="size-4 animate-spin" /> Loading…
                </div>
              ) : summary ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.datasets_anonymised}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Datasets anonymised</div>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.running_jobs}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Running jobs</div>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.drift_jobs}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Drift flagged</div>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-[var(--text-secondary)]">
                Select a source dataset to see consent purposes, processors, and RoPA activities linked via Data
                Inventory.
              </p>
              <select
                className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-card)] border-[var(--border-default)]"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
              >
                <option value="">— Select dataset —</option>
                {exportableAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.personal_field_count + a.sensitive_field_count} PII fields)
                  </option>
                ))}
              </select>

              {loadingUsage && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-2">
                  <Loader2 className="size-4 animate-spin" /> Loading usage…
                </div>
              )}

              {!loadingUsage && usage && (
                <div className="space-y-3 text-sm">
                  {usage.purposes.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Consent purposes</div>
                      <ul className="space-y-1">
                        {usage.purposes.map((p) => (
                          <li key={p.purpose_id} className="rounded-md border px-3 py-2 flex justify-between">
                            <span>{p.purpose_name}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">{p.field_names.length} field(s)</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {usage.processors.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">Processors</div>
                      <ul className="text-xs text-[var(--text-tertiary)] space-y-1">
                        {usage.processors.map((p) => (
                          <li key={p.processor_id}>{p.processor_name}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {usage.activities.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-1">RoPA activities</div>
                      <ul className="text-xs text-[var(--text-tertiary)] space-y-1">
                        {usage.activities.map((a) => (
                          <li key={a.activity_id}>{a.activity_title}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {usage.purposes.length === 0 &&
                    usage.processors.length === 0 &&
                    usage.activities.length === 0 && (
                      <p className="text-xs text-[var(--text-tertiary)]">
                        No linked purposes, processors, or activities — link this asset in Data Inventory.
                      </p>
                    )}
                </div>
              )}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Where anonymised output is used">
            {recentOutputs.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">No completed exports yet.</p>
            ) : (
              <ul className="space-y-2">
                {recentOutputs.map((o) => (
                  <li key={o.id} className="rounded-lg border border-[var(--border-default)] p-3 text-sm">
                    <div className="font-medium text-[var(--text-primary)]">{o.name}</div>
                    <div className="text-xs text-[var(--text-secondary)] mt-1">
                      Source: {o.dataset ?? '—'} · Technique: {TECHNIQUE_LABELS[o.technique]}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Recipient: {o.recipient ?? '—'} · Destination: {o.destination}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {recentOutputs.some((o) => o.destination === 's3') && (
              <p className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5 mt-2">
                <Globe className="size-3.5" />
                S3 outputs are written to the configured bucket under <code>anonymised/</code>.
              </p>
            )}
          </PlaybookSection>

          <PlaybookSection title="Go / no-go checklist">
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-indigo-500" />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Troubleshooting">
            <div className="space-y-2">
              {TROUBLESHOOTING.map((row) => (
                <div key={row.issue} className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{row.issue}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">{row.fix}</div>
                </div>
              ))}
            </div>
          </PlaybookSection>
        </div>
      </div>
    </div>
  );
}
