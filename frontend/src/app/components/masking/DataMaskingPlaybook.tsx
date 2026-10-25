import type { ReactElement, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  Lock,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { fetchAssetUsage, fetchAssets } from '@/lib/api/dataInventory';
import { fetchMaskingSummary, fetchPiiColumns } from '@/lib/api/masking';
import type { AssetUsageMap, InventoryAsset } from '@/types/dataInventory';
import type { MaskingSummary, PiiColumnTarget } from '@/types/masking';

interface DataMaskingPlaybookProps {
  onClose: () => void;
  orgId?: string;
}

const PREREQUISITES = [
  'Data sources registered and connection-tested (Data Sources module).',
  'PII Scanner run at least once — columns must be classified before they appear here.',
  'Data Inventory fields tagged with personal/sensitive classification.',
  'Purpose → field mappings configured for consent-linked columns (Consent Enforcement).',
  'Read-write integration mode enabled only after DPO sign-off (production sources).',
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Discover PII columns',
    detail:
      'Run the PII Scanner against each business-critical source. Classified columns auto-populate the Detected PII Columns table.',
    icon: ShieldCheck,
  },
  {
    step: 2,
    title: 'Define category rules',
    detail:
      'Set a masking strategy per PII category (email → partial mask, Aadhaar → hash). Built-in defaults apply until you save an override.',
    icon: Lock,
  },
  {
    step: 3,
    title: 'Preview on real samples',
    detail:
      'Use Preview on each column to verify before/after samples from the live source. No data is changed during preview.',
    icon: Database,
  },
  {
    step: 4,
    title: 'Apply on non-prod first',
    detail:
      'Test destructive apply on staging/dev clones. Production requires typed APPLY confirmation and DPO acknowledgment.',
    icon: Shield,
  },
  {
    step: 5,
    title: 'Link retention & withdrawal',
    detail:
      'Retention policies and consent withdrawal remediation reuse these rules for Sec 8(7) erasure and Sec 6(6) cease-processing.',
    icon: Scale,
  },
  {
    step: 6,
    title: 'Verify safeguard metadata',
    detail:
      'Tag inventory fields with security_safeguard = masking and confirm apply history in the audit ledger.',
    icon: CheckCircle2,
  },
];

const DECISION_MATRIX = [
  { action: 'Mask (partial)', when: 'Display-layer protection, non-prod clones, Sec 8(5) safeguard', sec: '8(5)' },
  { action: 'Hash / redact', when: 'Irreversible pseudonymization when deletion is impractical', sec: '8(7)' },
  { action: 'Delete', when: 'Purpose fulfilled or erasure request — preferred for Sec 11', sec: '11' },
  { action: 'Anonymise (export)', when: 'Analytics datasets — use Data Anonymisation module', sec: '8(5)' },
];

const CHECKLIST = [
  'Every PII category has an active masking rule or accepted default',
  'Production sources use read-write mode only where masking/retention is required',
  'All sensitive columns mapped to at least one declared purpose',
  'Retention policies exist for sensitive categories (Sec 8(7))',
  'Withdrawal remediation tested for mask-mapped fields',
  'Apply history reviewed in the last 30 days',
  'File/API sources routed to Data Anonymisation instead of in-place apply',
];

const TROUBLESHOOTING = [
  {
    issue: 'Column shows "Not maskable" (file)',
    fix: 'File stores, APIs and logs cannot be masked in place. Export and anonymise via the Data Anonymisation module.',
  },
  {
    issue: 'Apply fails — discovery mode',
    fix: 'Promote the source to read-write integration mode in Data Sources after DPO approval.',
  },
  {
    issue: 'Apply fails — missing id column',
    fix: 'SQL sources need a primary-key column (id, uuid, etc.) for per-row updates.',
  },
  {
    issue: 'Purposes empty on a sensitive column',
    fix: 'Map the field to a Purpose in Consent Enforcement or Data Inventory field detail.',
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

export function DataMaskingPlaybook({ onClose, orgId }: DataMaskingPlaybookProps): ReactElement {
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [columns, setColumns] = useState<PiiColumnTarget[]>([]);
  const [summary, setSummary] = useState<MaskingSummary | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [usage, setUsage] = useState<AssetUsageMap | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAssets(orgId), fetchPiiColumns(orgId), fetchMaskingSummary(orgId)])
      .then(([a, c, s]) => {
        setAssets(a.filter((x) => x.field_count > 0));
        setColumns(c);
        setSummary(s);
      })
      .catch(() => {
        setAssets([]);
        setColumns([]);
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

  const maskableAssets = useMemo(() => {
    const ids = new Set(columns.map((c) => c.asset_id));
    return assets.filter((a) => ids.has(a.id));
  }, [assets, columns]);

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
        aria-labelledby="masking-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-violet-600/10 to-indigo-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-600/15 text-violet-700 dark:text-violet-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="masking-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                Data Masking Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                Implement Sec 8(5) security safeguards on live database columns — define rules, preview,
                apply in place, and trace where masked data is used across purposes and processors.
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-raised)]">
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          <PlaybookSection title="What this module does">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                Data Masking rewrites PII values <strong className="text-[var(--text-primary)]">in place</strong> on
                connected SQL and MongoDB sources. It supports Sec 8(5) safeguards and feeds retention/withdrawal
                remediation for Sec 8(7) and Sec 6(6).
              </p>
              <div className="flex flex-wrap gap-2">
                {['Sec 8(5) — Safeguards', 'Sec 8(7) — Storage limitation', 'Sec 6(6) — Withdrawal', 'Sec 11 — Erasure context', 'DPDP Rules 2025'].map(
                  (chip) => (
                    <span key={chip} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                      <Scale className="size-3.5" /> {chip}
                    </span>
                  ),
                )}
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Roles & responsibilities">
            <div className="grid gap-3">
              {[
                { role: 'DPO / Compliance', icon: Scale, tasks: 'Approve production apply, choose mask vs delete per purpose, sign off coverage.' },
                { role: 'Data / Platform', icon: Database, tasks: 'Run PII scans, configure rules, promote sources to read-write after approval.' },
                { role: 'Engineering', icon: Shield, tasks: 'Provision non-prod clones for testing; never apply hash/redact on prod without ticket.' },
                { role: 'Legal', icon: Users, tasks: 'Advise when masking satisfies erasure vs when deletion is required (Sec 11).' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.role} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-600/10 text-violet-600">
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
                  <Circle className="size-4 shrink-0 mt-0.5 text-violet-500" strokeWidth={2.5} />
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
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white text-sm font-bold">
                      {step.step}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-violet-600" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Mask vs anonymise vs delete">
            <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--surface-raised)] text-[var(--text-tertiary)]">
                    <th className="text-left py-2 px-3">Action</th>
                    <th className="text-left py-2 px-3">When to use</th>
                    <th className="text-left py-2 px-3">DPDPA</th>
                  </tr>
                </thead>
                <tbody>
                  {DECISION_MATRIX.map((row) => (
                    <tr key={row.action} className="border-t border-[var(--border-default)]">
                      <td className="py-2 px-3 font-medium text-[var(--text-primary)]">{row.action}</td>
                      <td className="py-2 px-3 text-[var(--text-secondary)]">{row.when}</td>
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
                  <Loader2 className="size-4 animate-spin" /> Loading coverage…
                </div>
              ) : summary ? (
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.coverage_pct}%</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">PII coverage</div>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.sources_read_write}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Read-write sources</div>
                  </div>
                  <div className="rounded-lg bg-[var(--surface-raised)] p-3">
                    <div className="text-lg font-semibold">{summary.columns_applied_last_30d}</div>
                    <div className="text-[10px] text-[var(--text-secondary)]">Applied (30d)</div>
                  </div>
                </div>
              ) : null}

              <p className="text-xs text-[var(--text-secondary)]">
                Select an asset to see consent purposes, processors, and RoPA activities for its fields.
              </p>
              <select
                className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-card)] border-[var(--border-default)]"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
              >
                <option value="">— Select asset with PII —</option>
                {maskableAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.field_count} fields)
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
                </div>
              )}

              {summary && summary.sources.length > 0 && (
                <div className="pt-2 border-t border-[var(--border-default)]">
                  <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">Coverage by source</div>
                  <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                    {summary.sources.map((s) => (
                      <li key={s.data_source_id} className="flex justify-between text-xs rounded-md border px-2 py-1.5">
                        <span>{s.data_source_name}</span>
                        <span className={s.coverage_pct < 100 ? 'text-[var(--status-danger)]' : 'text-[var(--status-success)]'}>
                          {s.covered_by_rules}/{s.total_pii_fields} ({s.coverage_pct}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Go-live checklist">
            <ul className="space-y-2">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[var(--text-secondary)]">
                  <CheckCircle2 className="size-4 shrink-0 text-violet-500" />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Troubleshooting">
            <div className="space-y-2">
              {TROUBLESHOOTING.map((t) => (
                <div key={t.issue} className="rounded-lg border border-[var(--border-default)] p-3">
                  <div className="text-sm font-medium text-[var(--text-primary)]">{t.issue}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">{t.fix}</div>
                </div>
              ))}
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--text-secondary)]">
              <AlertTriangle className="size-4 shrink-0 text-[var(--status-warning)]" />
              Masking in place on production without backup is irreversible for hash/redact strategies. Always preview first.
            </div>
          </PlaybookSection>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--border-default)]">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-lg bg-[var(--surface-raised)] text-sm font-medium hover:bg-[var(--border-default)]"
          >
            Close playbook
          </button>
        </div>
      </div>
    </div>
  );
}
