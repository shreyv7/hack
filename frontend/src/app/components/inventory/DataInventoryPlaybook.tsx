import type { ReactElement, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  FileText,
  Globe,
  Loader2,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { fetchAssetUsage, fetchAssets } from '@/lib/api/dataInventory';
import type { AssetUsageMap, InventoryAsset } from '@/types/dataInventory';

interface DataInventoryPlaybookProps {
  onClose: () => void;
  orgId?: string;
}

const PREREQUISITES = [
  'At least one data source registered and connection-tested (Data Sources module).',
  'Assets imported or manually catalogued with field-level classification.',
  'Cross-border and country metadata captured for assets storing data outside India.',
  'Processing activities in RoPA linked to relevant inventory assets.',
  'Third-party processors with valid DPA status linked to shared assets.',
  'Purpose → field mappings configured for consent enforcement (where applicable).',
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Connect data sources',
    detail:
      'Register databases, cloud stores, and file sources. Test connections before schema import.',
    icon: Database,
  },
  {
    step: 2,
    title: 'Import or add assets',
    detail:
      'Use Import from Source for databases/files, or Add Asset manually for applications and APIs.',
    icon: FileText,
  },
  {
    step: 3,
    title: 'Classify fields',
    detail:
      'Review heuristic classifications, run PII Scanner for confirmation, and tag security safeguards per DPDP Rules 2025.',
    icon: ShieldCheck,
  },
  {
    step: 4,
    title: 'Link processors & activities',
    detail:
      'In each asset detail, link RoPA processing activities and third-party processors that consume or receive this data.',
    icon: Users,
  },
  {
    step: 5,
    title: 'Capture cross-border metadata',
    detail:
      'Flag cross-border transfers, record country and transfer mechanism for Sec 16 compliance.',
    icon: Globe,
  },
  {
    step: 6,
    title: 'DPO review & export',
    detail:
      'Resolve review_needed assets, export the register for audit packets, and sync with RoPA / Enforcement modules.',
    icon: Scale,
  },
];

const TROUBLESHOOTING = [
  {
    issue: 'Fields stay unclassified after import',
    fix: 'Run PII Scanner on the linked data source, or manually classify fields in the asset detail drawer.',
  },
  {
    issue: 'Purpose badges empty on fields',
    fix: 'Configure purpose → field mappings in Consent Enforcement setup wizard.',
  },
  {
    issue: 'Used In panel shows no processors',
    fix: 'Register processors in Workspace, then link them from the asset detail Used In section.',
  },
  {
    issue: 'Asset stuck in Review Needed',
    fix: 'Classify all unclassified fields, then set status to Active after DPO confirmation.',
  },
];

function PlaybookSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): ReactElement {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DataInventoryPlaybook({ onClose, orgId }: DataInventoryPlaybookProps): ReactElement {
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [usage, setUsage] = useState<AssetUsageMap | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    fetchAssets(orgId)
      .then(setAssets)
      .catch(() => setAssets([]));
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
        aria-labelledby="inventory-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-teal-600/10 to-cyan-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-600/15 text-teal-700 dark:text-teal-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="inventory-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                Data Inventory Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                DPDPA accountability register — catalogue what personal data you hold, where it lives,
                who accesses it, and how it flows to processors and processing activities.
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
                Data Inventory is the structural foundation of Vajra. It answers{' '}
                <strong className="text-[var(--text-primary)]">what</strong> personal data you hold,{' '}
                <strong className="text-[var(--text-primary)]">where</strong> it is stored, and{' '}
                <strong className="text-[var(--text-primary)]">how</strong> it is classified — feeding
                RoPA, Consent Enforcement, DSAR, and retention modules.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Sec 8(1) — Accountability',
                  'Sec 8(2) — Processor contracts',
                  'Sec 8(5) — Security safeguards',
                  'Sec 9 — Children\'s data',
                  'Sec 10 — SDF audits',
                  'Sec 11 — Access rights',
                  'Sec 16 — Cross-border',
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
                  tasks: 'Approve classifications, review cross-border flags, sign off asset register before audit.',
                },
                {
                  role: 'Data / Platform',
                  icon: Database,
                  tasks: 'Import schemas, run PII scans, maintain field classifications and processor links.',
                },
                {
                  role: 'Engineering',
                  icon: Shield,
                  tasks: 'Connect data sources, configure schema introspection, implement security safeguards.',
                },
                {
                  role: 'Legal / Vendor',
                  icon: Users,
                  tasks: 'Track DPA status for linked processors, validate transfer mechanisms.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.role}
                    className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3 bg-[var(--surface)]"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-600">
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
                  <Circle className="size-4 shrink-0 mt-0.5 text-teal-500" strokeWidth={2.5} />
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
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white text-sm font-bold">
                      {step.step}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-teal-600 shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Data usage map (live)">
            <div className="rounded-xl border border-[var(--border-default)] p-4 space-y-4">
              <p className="text-xs text-[var(--text-secondary)]">
                Select an asset to see where its data is used — consent purposes, linked processors,
                and RoPA processing activities.
              </p>
              <select
                className="w-full px-3 py-2 rounded-md border text-sm bg-[var(--surface-card)] border-[var(--border-default)] text-[var(--text-primary)]"
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
              >
                <option value="">— Select asset —</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.field_count} fields)
                  </option>
                ))}
              </select>

              {loadingUsage && (
                <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] py-4">
                  <Loader2 className="size-4 animate-spin" /> Loading usage map…
                </div>
              )}

              {!loadingUsage && usage && (
                <div className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-[var(--surface-raised)] p-3 text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {usage.purpose_count}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Purposes</div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-raised)] p-3 text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {usage.processor_count}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Processors</div>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-raised)] p-3 text-center">
                      <div className="text-lg font-semibold text-[var(--text-primary)]">
                        {usage.activity_count}
                      </div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Activities</div>
                    </div>
                  </div>

                  {usage.purposes.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                        Consent / processing purposes
                      </div>
                      <ul className="space-y-1.5">
                        {usage.purposes.map((p) => (
                          <li
                            key={p.purpose_id}
                            className="flex justify-between gap-2 rounded-md border border-[var(--border-default)] px-3 py-2"
                          >
                            <span className="font-medium text-[var(--text-primary)]">{p.purpose_name}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              {p.field_names.length} field(s) · {p.legal_basis}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {usage.processors.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                        Shared with processors
                      </div>
                      <ul className="space-y-1.5">
                        {usage.processors.map((p) => (
                          <li
                            key={p.id}
                            className="flex justify-between gap-2 rounded-md border border-[var(--border-default)] px-3 py-2"
                          >
                            <span className="font-medium text-[var(--text-primary)]">{p.processor_name}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              DPA: {p.processor_dpa_status ?? 'none'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {usage.activities.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-[var(--text-secondary)] mb-2">
                        RoPA processing activities
                      </div>
                      <ul className="space-y-1.5">
                        {usage.activities.map((a) => (
                          <li
                            key={a.id}
                            className="flex justify-between gap-2 rounded-md border border-[var(--border-default)] px-3 py-2"
                          >
                            <span className="font-medium text-[var(--text-primary)]">{a.activity_title}</span>
                            <span className="text-xs text-[var(--text-tertiary)]">
                              {a.activity_ref ?? a.risk_level ?? '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {usage.purpose_count === 0 &&
                    usage.processor_count === 0 &&
                    usage.activity_count === 0 && (
                      <p className="text-xs text-[var(--text-tertiary)] py-2">
                        No usage links yet. Link processors and activities from the asset detail drawer,
                        and configure purpose mappings in Consent Enforcement.
                      </p>
                    )}
                </div>
              )}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Go-live checklist">
            <ul className="space-y-2">
              {[
                'All production data sources connected and schema imported',
                'Sensitive and personal fields classified with security safeguards',
                'Cross-border assets flagged with country and transfer mechanism',
                'Children\'s data fields tagged (Sec 9)',
                'Processors linked with signed DPA where data is shared',
                'RoPA activities linked to corresponding assets',
                'Review backlog cleared — no assets in review_needed',
                'Register exported and filed for DPO audit trail',
              ].map((item) => (
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
                <div
                  key={row.issue}
                  className="rounded-lg border border-[var(--border-default)] p-3 text-sm"
                >
                  <div className="font-medium text-[var(--text-primary)]">{row.issue}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">{row.fix}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-2 mt-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[var(--status-warning)]" />
              Schema import only classifies by column name heuristics. Always run PII Scanner or manual
              review before promoting assets to Active.
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
