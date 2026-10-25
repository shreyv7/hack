import type { ReactElement, ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Circle,
  Database,
  Key,
  Lock,
  Scale,
  Shield,
  ShieldCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { getPublicApiBaseUrl } from '@/lib/integrationUrls';

interface EnforcementPlaybookProps {
  onClose: () => void;
  onOpenWizard?: () => void;
}

const PREREQUISITES = [
  'Consent-based purposes defined in Purpose Registry (legal basis = consent).',
  'Live consent notice published and linked to those purposes.',
  'Integration property created (website, mobile, or API) with API key issued.',
  'Data Inventory assets catalogued with fields you plan to protect.',
  'Engineering owner identified for backend middleware integration.',
  'DPO / compliance sign-off on purpose → field mapping before enforced mode.',
];

const ROLLOUT_PHASES = [
  {
    mode: 'Disabled',
    color: 'bg-[var(--surface-raised)] text-[var(--text-secondary)]',
    summary: 'Default state. Decisions are recorded only if you call the Decision API manually — nothing blocks production traffic.',
    actions: ['Configure purposes, mappings, and signing secret.', 'Run integration tests in staging.'],
  },
  {
    mode: 'Shadow',
    color: 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]',
    summary:
      'Observes real traffic and logs what would have been allowed or denied — without blocking writes. Review the Event log before promoting.',
    actions: ['Promote property to shadow.', 'Monitor denied / would-deny counts for 1–2 weeks.', 'Fix mapping gaps flagged as Unmapped.'],
  },
  {
    mode: 'Enforced',
    color: 'bg-[var(--status-success-bg)] text-[var(--status-success)]',
    summary:
      'Both property and purpose must be enforced before writes are blocked. Contract / legitimate-use purposes are never blockable.',
    actions: ['DPO sign-off on mappings.', 'Promote property and each purpose to enforced.', 'Monitor Denied today and remediation queue.'],
  },
];

const IMPLEMENTATION_STEPS = [
  {
    step: 1,
    title: 'Select integration property',
    detail: 'Choose the website, mobile app, or API property whose backend will enforce consent. Each property has its own signing secret and enforcement mode.',
    icon: Shield,
  },
  {
    step: 2,
    title: 'Register collection points',
    detail:
      'Enable enforcement for each consent-based purpose (e.g. marketing, analytics, personalization). Contract and legitimate-use purposes are always allowed.',
    icon: ShieldCheck,
  },
  {
    step: 3,
    title: 'Map inventory fields',
    detail:
      'Link each purpose to Data Inventory fields. This drives withdrawal remediation — mask, anonymize, delete, or flag for manual review when consent is withdrawn.',
    icon: Database,
  },
  {
    step: 4,
    title: 'Generate signing secret',
    detail:
      'Create a per-property decision signing secret (encrypted at rest). Your backend uses this to verify short-lived decision tokens locally without a network call on every request.',
    icon: Key,
  },
  {
    step: 5,
    title: 'Configure deny behavior',
    detail:
      'Per purpose: Reject (403), Strip fields from payload, or Queue pending until consent is obtained. Choose based on whether a hard block or graceful degradation fits the user journey.',
    icon: Lock,
  },
  {
    step: 6,
    title: 'Run test cases',
    detail:
      'Validate granted consent, denied consent, expired token fallback, withdrawal remediation, and contract-purpose carve-outs before shadow promotion.',
    icon: Zap,
  },
  {
    step: 7,
    title: 'Promote to shadow, then enforced',
    detail:
      'Start in shadow mode. Review Event log evidence. Promote to enforced only after DPO review and engineering confirmation.',
    icon: CheckCircle2,
  },
];

const METRICS = [
  { label: 'Coverage', meaning: '% of consent purposes with at least one inventory field mapped.' },
  { label: 'Protected endpoints', meaning: 'Purposes actively enforced (property + purpose both promoted).' },
  { label: 'Denied today', meaning: 'Decision API or middleware blocked or shadow-flagged a write today.' },
  { label: 'Pending remediations', meaning: 'Withdrawal-triggered mask/delete/anonymize tasks awaiting completion.' },
  { label: 'Decision API p95', meaning: '95th-percentile latency for server-side consent decisions (fallback path).' },
];

const TROUBLESHOOTING = [
  {
    issue: 'Collection point shows Unmapped',
    fix: 'Open Setup wizard → Map fields, or map manually in Data Inventory purpose badges. Purpose mode can be enforced only after mapping exists.',
  },
  {
    issue: 'Coverage stays at 0%',
    fix: 'Ensure purposes use legal basis = consent and are not archived. Add at least one purpose_data_mapping per purpose.',
  },
  {
    issue: 'Every decision is denied',
    fix: 'Check fingerprint alignment — send raw email/phone to Decision API (server hashes). Do not reimplement the hash client-side.',
  },
  {
    issue: 'Token verification fails',
    fix: 'Confirm ZEROSHIELD_DECISION_SECRET matches the property signing secret. Tokens are HS256, per-property, short TTL.',
  },
  {
    issue: 'Checkout blocked after go-live',
    fix: 'Demote property to shadow immediately. Contract / service-delivery purposes must use legal basis ≠ consent — they cannot be blockable.',
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

export function EnforcementPlaybook({ onClose, onOpenWizard }: EnforcementPlaybookProps): ReactElement {
  const apiBase = getPublicApiBaseUrl();

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
        aria-labelledby="enforcement-playbook-title"
      >
        <div className="shrink-0 px-6 py-5 border-b border-[var(--border-default)] bg-gradient-to-r from-indigo-600/10 to-violet-600/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-600/15 text-indigo-700 dark:text-indigo-300 mb-2">
                <BookOpen className="size-3.5" />
                Organization playbook
              </div>
              <h2 id="enforcement-playbook-title" className="text-xl font-semibold text-[var(--text-primary)]">
                Consent Enforcement Playbook
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-lg">
                DPDPA Section 6 — operational guide for rolling out consent-before-processing across your own
                systems, not just browser trackers.
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
                A consent banner alone does not stop your backend from writing personal data. Consent Enforcement
                connects banner decisions to <strong className="text-[var(--text-primary)]">your APIs and databases</strong>{' '}
                via the Decision API, signed decision tokens, and optional middleware.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <Scale className="size-3.5" /> Ch.2 §6 — Consent before processing
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--surface-raised)] text-xs">
                  <ShieldCheck className="size-3.5" /> Proof Vault audit trail
                </span>
              </div>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Roles & responsibilities">
            <div className="grid gap-3">
              {[
                {
                  role: 'DPO / Compliance',
                  icon: Scale,
                  tasks: 'Approve purpose list, sign off mappings, review shadow logs before enforced promotion.',
                },
                {
                  role: 'Engineering',
                  icon: Zap,
                  tasks: 'Integrate Decision API / middleware, deploy tokens, handle deny behaviors in APIs.',
                },
                {
                  role: 'Data / Platform',
                  icon: Database,
                  tasks: 'Maintain Data Inventory, field mappings, and remediation job completion.',
                },
                {
                  role: 'Product / Ops',
                  icon: Users,
                  tasks: 'Define which user journeys require consent vs contract / legitimate use.',
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.role}
                    className="flex gap-3 rounded-lg border border-[var(--border-default)] p-3 bg-[var(--surface)]"
                  >
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

          <PlaybookSection title="Rollout phases">
            <div className="space-y-3">
              {ROLLOUT_PHASES.map((phase) => (
                <div
                  key={phase.mode}
                  className="rounded-xl border border-[var(--border-default)] overflow-hidden"
                >
                  <div className="px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--surface-raised)] flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${phase.color}`}>{phase.mode}</span>
                  </div>
                  <div className="p-4 space-y-2 text-sm">
                    <p className="text-[var(--text-secondary)]">{phase.summary}</p>
                    <ul className="space-y-1">
                      {phase.actions.map((action) => (
                        <li key={action} className="flex gap-2 text-xs text-[var(--text-secondary)]">
                          <CheckCircle2 className="size-3.5 shrink-0 mt-0.5 text-[var(--status-success)]" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--text-tertiary)] flex items-start gap-2 mt-2">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-[var(--status-warning)]" />
              Effective mode = minimum of property mode and purpose mode. Both must be <strong>Enforced</strong> before
              writes are blocked.
            </p>
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
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-indigo-600 shrink-0" />
                        <span className="text-sm font-medium text-[var(--text-primary)]">{step.title}</span>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-1">{step.detail}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </PlaybookSection>

          <PlaybookSection title="Integration reference">
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] p-4 space-y-3">
              <p className="text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">Fast path:</strong> Browser SDK issues a short-lived
                decision token → your API verifies locally with the property signing secret.
              </p>
              <p className="text-xs text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">Fallback:</strong> POST to Decision API with raw
                identifier fields (email / phone). ZeroShield hashes server-side — never reimplement the fingerprint.
              </p>
              <pre className="text-[11px] leading-relaxed p-3 rounded-md bg-[var(--surface-card)] border border-[var(--border-default)] overflow-x-auto text-[var(--text-secondary)]">
                {`POST ${apiBase}/integrations/{property_id}/consent/decision
X-API-Key: <property_api_key>

{
  "purpose_key": "marketing",
  "principal_email": "user@example.com",
  "principal_phone": "+919876543210"
}`}
              </pre>
            </div>
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

          <PlaybookSection title="Withdrawal & remediation">
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:bg-amber-950/20 p-4 text-sm text-[var(--text-secondary)] space-y-2">
              <p>
                When a data principal withdraws consent, ZeroShield dispatches a webhook and queues remediation tasks
                based on your purpose → field mappings (mask, anonymize, delete, etc.).
              </p>
              <p>
                Monitor the <strong className="text-[var(--text-primary)]">Remediation</strong> tab for pending and
                overdue tasks. Every action is sealed in Proof Vault for audit.
              </p>
            </div>
          </PlaybookSection>

          <PlaybookSection title="Go-live checklist">
            <ul className="space-y-2">
              {[
                'All consent purposes mapped to inventory fields',
                'Shadow mode reviewed — no unexpected denials on contract flows',
                'Signing secret stored in secrets manager (not in source code)',
                'Middleware / decorator deployed on all collection endpoints',
                'DPO written sign-off recorded',
                'Property and purposes promoted to Enforced',
                'On-call runbook includes demote-to-shadow procedure',
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
          {onOpenWizard ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenWizard();
              }}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
            >
              Open setup wizard
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
