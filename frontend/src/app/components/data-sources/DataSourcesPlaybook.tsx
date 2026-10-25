import type { ReactElement, ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Cloud,
  Database,
  Globe,
  Lock,
  MapPin,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';

interface DataSourcesPlaybookProps {
  onClose: () => void;
  onAddSource?: () => void;
}

const PREREQUISITES = [
  'Organization workspace settings configured with allowed data residency regions.',
  'DPO or data owner assigned for each production source.',
  'Read-only service accounts provisioned for discovery integrations where possible.',
  'Vendor/processor registry populated for third-party operated infrastructure.',
  'Data Inventory module ready to receive schema imports.',
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Register every data store',
    detail:
      'Add databases, cloud stores, file buckets, APIs, and log streams. Unregistered sources are shadow databases — invisible to compliance.',
    icon: Database,
  },
  {
    step: 2,
    title: 'Test connections & assign ownership',
    detail:
      'Verify connectivity, assign an owner, set environment (prod/staging/dev), and criticality. Flag encryption-at-rest and SSL safeguards.',
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: 'Import schema into Data Inventory',
    detail:
      'Run schema scan on DB/cloud sources to catalogue tables and columns. This is the foundation for PII classification and purpose mapping.',
    icon: MapPin,
  },
  {
    step: 4,
    title: 'Scan for PII & classify fields',
    detail:
      'Use the PII Scanner to sample values and upgrade name-based guesses to data-verified classifications.',
    icon: Shield,
  },
  {
    step: 5,
    title: 'Link processors & check residency',
    detail:
      'Attach third-party processors and verify the source region matches your approved residency policy. Flag cross-border transfers.',
    icon: Globe,
  },
  {
    step: 6,
    title: 'Govern with masking & retention',
    detail:
      'Apply masking rules to sensitive fields and attach retention policies. Use read-write integration mode only after DPO approval.',
    icon: Lock,
  },
];

const DOWNSTREAM_MODULES = [
  {
    module: 'Data Inventory',
    path: '/data/inventory',
    role: 'Catalogues tables, columns, and field classifications imported from each source.',
  },
  {
    module: 'PII Scanner',
    path: '/scanner/pii',
    role: 'Samples live values to detect and verify personally identifiable information.',
  },
  {
    module: 'Data Masking',
    path: '/data/masking',
    role: 'Rewrites PII in connected SQL/MongoDB sources (read-write mode required).',
  },
  {
    module: 'Retention Policies',
    path: '/data/retention',
    role: 'Deletes, masks, or anonymises expired records per DPDPA §8(7).',
  },
  {
    module: 'Data Anonymisation',
    path: '/data/anonymisation',
    role: 'Produces anonymised datasets; can write output back to a registered source.',
  },
  {
    module: 'RoPA',
    path: '/governance/ropa',
    role: 'Links processing activities to the systems where data is stored.',
  },
  {
    module: 'Cross-Border Transfer',
    path: '/governance/cross-border-transfer',
    role: 'Documents transfers when a source or its processor operates outside approved regions.',
  },
  {
    module: 'Consent Enforcement',
    path: '/consent/enforcement',
    role: 'Maps consent purposes to inventory fields sourced from registered systems.',
  },
];

const METRICS = [
  { label: 'Total sources', meaning: 'All registered data connections across categories.' },
  { label: 'Connected', meaning: 'Sources whose last connection test succeeded.' },
  { label: 'Outside residency', meaning: 'Sources in regions not matching org allowed_regions / data_residency settings.' },
  { label: 'Needs re-test', meaning: 'Never tested, pending, or last tested more than 30 days ago.' },
  { label: 'Unowned', meaning: 'Production sources without an assigned owner — accountability gap under §8(1).' },
];

const TROUBLESHOOTING = [
  {
    issue: 'Source shows Outside residency policy',
    fix: 'Check Workspace Settings → allowed regions. Update source region or link the correct processor country code.',
  },
  {
    issue: 'Masking/Retention chips are greyed out',
    fix: 'Only DB-family connectors in read-write integration mode support in-place actions. Promote mode only after DPO sign-off.',
  },
  {
    issue: 'Schema scan finds nothing',
    fix: 'Ensure connection test passes first. Verify the service account has metadata read permissions on the target database.',
  },
  {
    issue: 'Data usage tab is empty',
    fix: 'Run schema import first, then PII scan. Purpose mappings appear after fields exist in Data Inventory.',
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
      <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">{title}</h3>
      {children}
    </section>
  );
}

export function DataSourcesPlaybook({ onClose, onAddSource }: DataSourcesPlaybookProps): ReactElement {
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
        aria-labelledby="data-sources-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-sky-600/10 to-indigo-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-600/15 text-sky-700 dark:text-sky-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="data-sources-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                Data Sources Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                DPDPA §8 — operational guide for registering, securing, and governing every system where personal
                data lives.
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
                Data Sources is the <strong className="text-[var(--text-primary)]">connection registry</strong> — the
                single ledger of where your organization&apos;s personal data physically resides. Every downstream
                protection module (inventory, scanning, masking, retention) depends on sources being registered here
                first.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Scale className="size-3.5" /> §8(1) — Fiduciary oversight
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Users className="size-3.5" /> §8(2) — Processor contracts
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Lock className="size-3.5" /> §8(5) — Security safeguards
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Shield className="size-3.5" /> §8(7) — Retention & erasure
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Globe className="size-3.5" /> §16 — Cross-border transfer
                </span>
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Roles & responsibilities">
            <div className="grid gap-3">
              {[
                { role: 'DPO / Compliance', icon: Scale, tasks: 'Approve read-write integrations, residency exceptions, and retention attachments.' },
                { role: 'IT / Platform Admin', icon: Cloud, tasks: 'Register connectors, rotate credentials, maintain connection health.' },
                { role: 'Data Owner', icon: Database, tasks: 'Owns a source end-to-end — knows what data it holds and who accesses it.' },
                { role: 'Security', icon: ShieldCheck, tasks: 'Verify SSL, encryption-at-rest, and least-privilege service accounts.' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.role} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3 bg-[var(--surface)]">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-600/10 text-sky-600">
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
                  <Circle className="size-4 shrink-0 mt-0.5 text-sky-500" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Registration lifecycle">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              {['Register', 'Test', 'Classify', 'Assign owner', 'Govern'].map((phase, i, arr) => (
                <span key={phase} className="inline-flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-sky-600/10 text-sky-700 dark:text-sky-300">{phase}</span>
                  {i < arr.length - 1 && <span className="text-[var(--text-tertiary)]">→</span>}
                </span>
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Each source card shows capability chips (Auto-inventory, PII scan, Masking, Retention) so you know what
              downstream actions are available before you configure them.
            </p>
          </PlaybookSection>

          <PlaybookSection title="Implementation steps">
            <div className="space-y-3">
              {IMPLEMENTATION_STEPS.map((step) => {
                const Icon = step.icon;
                return (
                  <div key={step.step} className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white text-sm font-bold">
                      {step.step}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-sky-600 shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Where source data is used">
            <div className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)] overflow-hidden">
              {DOWNSTREAM_MODULES.map((row) => (
                <div key={row.module} className="flex gap-4 px-4 py-3 text-sm bg-[var(--surface)]">
                  <a
                    href={row.path}
                    className="font-medium text-sky-600 hover:underline w-40 shrink-0"
                    onClick={onClose}
                  >
                    {row.module}
                  </a>
                  <span className="text-[var(--text-secondary)]">{row.role}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-2 mt-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[var(--status-warning)]" />
              Open any source&apos;s <strong>Data usage</strong> tab to see live links for that specific connector.
            </p>
          </PlaybookSection>

          <PlaybookSection title="Dashboard metrics">
            <div className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)] overflow-hidden">
              {METRICS.map((m) => (
                <div key={m.label} className="flex gap-4 px-4 py-3 text-sm bg-[var(--surface)]">
                  <span className="font-medium text-[var(--text-primary)] w-36 shrink-0">{m.label}</span>
                  <span className="text-[var(--text-secondary)]">{m.meaning}</span>
                </div>
              ))}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Security safeguards checklist">
            <ul className="space-y-2">
              {[
                'SSL/TLS enabled for all database and API connections',
                'Encryption-at-rest documented for each production source',
                'Credentials stored encrypted; rotated at least annually',
                'Discovery-only mode for sources that only need scanning',
                'Read-write mode promoted only with DPO written approval',
                'Connection tests re-run after credential or host changes',
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--status-success)]" />
                  {item}
                </li>
              ))}
            </ul>
          </PlaybookSection>

          <PlaybookSection title="Go-live checklist">
            <ul className="space-y-2">
              {[
                'Every production database and file store registered',
                'All sources connection-tested and status = Connected',
                'Owners assigned for production and high/critical sources',
                'Schema imported into Data Inventory for DB sources',
                'Residency flags reviewed — exceptions documented',
                'Retention policies attached where personal data is stored',
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
                <div key={row.issue} className="rounded-lg border border-[var(--border-default)] p-3 text-sm">
                  <div className="font-medium text-[var(--text-primary)]">{row.issue}</div>
                  <div className="text-xs text-[var(--text-secondary)] mt-1">{row.fix}</div>
                </div>
              ))}
            </div>
          </PlaybookSection>
        </div>

        <div className="shrink-0 px-6 py-4 border-t border-[var(--border-default)] flex flex-wrap gap-3 justify-end bg-[var(--surface-raised)]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--border-default)] hover:bg-[var(--surface-card)]"
          >
            Close
          </button>
          {onAddSource ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAddSource();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-sky-600 text-white hover:bg-sky-700"
            >
              Add source
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
