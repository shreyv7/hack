import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ArrowRight,
  ClipboardCheck,
  Clock,
  Compass,
  Gauge,
  Layers,
  Scale,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';

type CompliancePhase = 'orient' | 'prevent' | 'respond' | 'prove';

interface ComplianceModule {
  id: string;
  phase: CompliancePhase;
  phaseLabel: string;
  phaseNumber: number;
  title: string;
  route: string;
  icon: LucideIcon;
  description: string;
  whenToUse: string;
  roles: string[];
  feedsFrom: string[];
  feedsInto: string[];
  dpdpaSection?: string;
  accent: string;
  accentBg: string;
  accentBorder: string;
}

interface Persona {
  role: string;
  icon: LucideIcon;
  modules: string[];
  responsibility: string;
}

const PHASES: { id: CompliancePhase; label: string; number: number }[] = [
  { id: 'orient', label: 'Orient', number: 1 },
  { id: 'prevent', label: 'Prevent', number: 2 },
  { id: 'respond', label: 'Respond', number: 3 },
  { id: 'prove', label: 'Prove', number: 4 },
];

const COMPLIANCE_FLOW: ComplianceModule[] = [
  {
    id: 'map',
    phase: 'orient',
    phaseLabel: 'Phase 1 — Orient',
    phaseNumber: 1,
    title: 'DPDPA Map',
    route: '/compliance/map',
    icon: Scale,
    description:
      'Interactive statute coverage map — browse DPDPA chapters and sections linked to Vajra features, with live evidence counts, gap analysis, and review status.',
    whenToUse: 'Start here. Establish which parts of the Act your platform covers before diving into controls or incidents.',
    roles: ['DPO', 'CCO', 'Auditors'],
    feedsFrom: ['Seeded statute catalog', 'Consent, audit, DSAR, and control evidence'],
    feedsInto: ['Deep links to 20+ modules', 'Compliance Score', 'Audit Log (review events)'],
    accent: 'text-amber-600',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
  },
  {
    id: 'safeguards',
    phase: 'prevent',
    phaseLabel: 'Phase 2 — Prevent',
    phaseNumber: 2,
    title: 'Security Safeguards',
    route: '/security/safeguards',
    icon: Shield,
    description:
      'Track Section 8 security control implementation — encryption, access management, logging, certifications — with coverage gauge and evidence attachments.',
    whenToUse: 'Ongoing after understanding gaps from the DPDPA Map — operationalize preventive security controls.',
    roles: ['CISO', 'Security Team', 'DPO'],
    feedsFrom: ['Platform sync (Inventory, CISO, Anonymisation, breach history)'],
    feedsInto: ['Compliance Score', 'Audit Log', 'DPDPA Map §8 evidence'],
    dpdpaSection: 'Section 8 — Security Safeguards',
    accent: 'text-rose-600',
    accentBg: 'bg-rose-50',
    accentBorder: 'border-rose-200',
  },
  {
    id: 'breach',
    phase: 'respond',
    phaseLabel: 'Phase 3 — Respond',
    phaseNumber: 3,
    title: 'Breach Disclosure Wizard',
    route: '/breach',
    icon: AlertTriangle,
    description:
      'Guided 72-hour breach workflow — impact assessment, DPB notification, data principal notification via Notice Delivery, and conditional public disclosure.',
    whenToUse: 'Incident-driven only — when a personal data breach is detected or suspected.',
    roles: ['SIRT', 'DPO', 'Legal Counsel'],
    feedsFrom: ['Manual wizard input', 'Audit Log verification', 'Notice Delivery channels'],
    feedsInto: ['Audit Log lifecycle events', 'Compliance Score deductions', 'DPDPA Map §8(6) evidence'],
    dpdpaSection: 'Section 8(6) — Breach Notification',
    accent: 'text-red-600',
    accentBg: 'bg-red-50',
    accentBorder: 'border-red-200',
  },
  {
    id: 'audit',
    phase: 'prove',
    phaseLabel: 'Phase 4 — Prove',
    phaseNumber: 4,
    title: 'Audit Log (New)',
    route: '/audit/log',
    icon: Clock,
    description:
      'Immutable hash-chained audit trail of platform actions — search, filter, integrity verification, per-event certificates, and evidence pack PDF export.',
    whenToUse: 'Continuous — verify integrity for internal audits, regulator requests, and breach investigations.',
    roles: ['CCO', 'Auditors', 'DPO'],
    feedsFrom: ['Consent, DSAR, map reviews, safeguards, breach, workspace, RoPA'],
    feedsInto: ['Breach impact assessment', 'Compliance Score trends', 'Auditor PDF packs'],
    dpdpaSection: 'Section 8(5) — Audit Trail',
    accent: 'text-orange-600',
    accentBg: 'bg-orange-50',
    accentBorder: 'border-orange-200',
  },
];

const PERSONAS: Persona[] = [
  {
    role: 'DPO / CCO',
    icon: ShieldCheck,
    modules: ['DPDPA Map', 'Security Safeguards', 'Breach Wizard', 'Audit Log'],
    responsibility: 'Owns compliance posture, gap remediation, and breach coordination.',
  },
  {
    role: 'CISO / Security Lead',
    icon: Shield,
    modules: ['Security Safeguards', 'Breach Disclosure Wizard'],
    responsibility: 'Implements controls and leads incident technical assessment.',
  },
  {
    role: 'Legal Counsel',
    icon: Scale,
    modules: ['Breach Disclosure Wizard', 'DPDPA Map'],
    responsibility: 'Reviews breach notifications and statutory coverage.',
  },
  {
    role: 'SIRT / Incident Response',
    icon: AlertTriangle,
    modules: ['Breach Disclosure Wizard'],
    responsibility: 'Runs the 72-hour breach workflow under DPO oversight.',
  },
  {
    role: 'Internal / External Auditor',
    icon: Users,
    modules: ['Audit Log', 'DPDPA Map'],
    responsibility: 'Verifies integrity and reviews statute coverage and evidence packs.',
  },
  {
    role: 'Admin',
    icon: ClipboardCheck,
    modules: ['All compliance modules'],
    responsibility: 'Marks map sections reviewed, updates control status, submits breach reports.',
  },
];

const CONNECTION_NODES = [
  { id: 'map', label: 'DPDPA Map', x: 50, y: 14, hub: true },
  { id: 'safeguards', label: 'Safeguards', x: 22, y: 40 },
  { id: 'breach', label: 'Breach', x: 78, y: 40 },
  { id: 'audit', label: 'Audit Log', x: 50, y: 66 },
  { id: 'score', label: 'Score', x: 22, y: 88 },
  { id: 'dashboards', label: 'Dashboards', x: 78, y: 88 },
];

const CONNECTION_EDGES: [string, string][] = [
  ['map', 'safeguards'],
  ['map', 'breach'],
  ['map', 'audit'],
  ['safeguards', 'audit'],
  ['breach', 'audit'],
  ['map', 'score'],
  ['audit', 'dashboards'],
];

function scrollToModule(id: string): void {
  document.getElementById(`module-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function ComplianceGuide(): ReactElement {
  const navigate = useNavigate();

  return (
    <ConsentManagementGate
      title="Compliance Guide"
      loading={false}
      error={null}
      hasOrg={true}
      isSuperadmin={false}
      organizations={[]}
      selectedOrgId={undefined}
      onSelectOrg={() => {}}
    >
      <div className="min-h-screen bg-[var(--surface-base)]">
        {/* Zone A — Hero */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#431407] via-[#9f1239] to-[#f59e0b] text-white py-16 px-8 sm:px-12 rounded-b-[2rem] shadow-lg">
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(255,255,255,0.15) 0, rgba(255,255,255,0.15) 1px, transparent 1px, transparent 12px)',
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(251,191,36,0.2),transparent_55%)]" />
          <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-6 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-semibold uppercase tracking-wider backdrop-blur-md text-amber-200">
                <ClipboardCheck className="w-3.5 h-3.5" />
                Compliance Playbook
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Your DPDPA Compliance Journey
              </h1>
              <p className="text-base text-amber-100/80 leading-relaxed">
                Four interconnected modules for accountability. Orient with the statute map, prevent with
                security safeguards, respond to breaches within 72 hours, and prove compliance with an
                immutable audit trail.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="primary"
                  size="md"
                  className="bg-white text-[#431407] hover:bg-amber-50 shadow-lg font-semibold"
                  onClick={() => navigate('/compliance/map')}
                >
                  Start with DPDPA Map →
                </Button>
                <a
                  href="#journey"
                  className="inline-flex items-center justify-center px-4 py-2 border border-white/25 hover:border-white/50 rounded-lg text-sm font-semibold transition-colors"
                >
                  Explore the Flow
                </a>
              </div>
            </div>

            <div className="hidden md:flex flex-col gap-3 shrink-0">
              {PHASES.map((phase) => (
                <div
                  key={phase.id}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10"
                >
                  <span className="w-7 h-7 rounded-full bg-amber-400/20 text-amber-200 text-xs font-bold flex items-center justify-center">
                    {phase.number}
                  </span>
                  <span className="text-sm font-semibold text-white/90">{phase.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-16" id="journey">
          {/* Prerequisite callout */}
          <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/60 space-y-2">
            <h4 className="font-bold text-sm text-amber-900">Before you start</h4>
            <p className="text-xs text-amber-800/80 leading-relaxed">
              Compliance demonstrates accountability after foundational setup. Complete{' '}
              <button
                type="button"
                onClick={() => navigate('/how-to-use')}
                className="font-semibold underline hover:text-amber-900"
              >
                Consent setup
              </button>{' '}
              and the{' '}
              <button
                type="button"
                onClick={() => navigate('/data-protection/guide')}
                className="font-semibold underline hover:text-amber-900"
              >
                Data Protection Guide
              </button>{' '}
              first — then use Compliance to map statutes, track controls, and maintain audit evidence.
            </p>
          </div>

          {/* Zone B — Phase Timeline */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">
              Recommended Flow
            </h2>
            <div className="sticky top-0 z-40 bg-[var(--surface-base)]/90 backdrop-blur-md border border-[var(--border-default)] rounded-2xl py-5 px-6 shadow-sm overflow-x-auto">
              <div className="flex items-center gap-0 min-w-max">
                {PHASES.map((phase, idx) => {
                  const modulesInPhase = COMPLIANCE_FLOW.filter((m) => m.phase === phase.id);
                  return (
                    <div key={phase.id} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => {
                          const first = modulesInPhase[0];
                          if (first) scrollToModule(first.id);
                        }}
                        className="flex flex-col items-center gap-2 group cursor-pointer"
                      >
                        <div className="w-10 h-10 rounded-full bg-amber-500/10 border-2 border-amber-500/40 text-amber-600 flex items-center justify-center text-sm font-bold group-hover:bg-amber-500 group-hover:text-white group-hover:border-amber-500 transition-all">
                          {phase.number}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-amber-600 transition-colors whitespace-nowrap">
                          {phase.label}
                        </span>
                      </button>
                      {idx < PHASES.length - 1 && (
                        <div className="w-14 sm:w-24 h-0.5 bg-gradient-to-r from-amber-400/60 to-amber-400/20 mx-2 sm:mx-4 mb-5" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Zone C — Module Journey Cards */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Module-by-Module Guide</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Follow this order for the smoothest compliance setup. Breach Wizard is incident-driven — not a daily step.
              </p>
            </div>

            {COMPLIANCE_FLOW.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.id}
                  id={`module-${mod.id}`}
                  className="scroll-mt-24 relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-400 to-rose-500" />
                  <div className="p-6 sm:p-8">
                    <div className="flex flex-col lg:flex-row gap-6">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              'p-3 rounded-xl border shrink-0',
                              mod.accentBg,
                              mod.accentBorder,
                              mod.accent,
                            )}
                          >
                            <Icon className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                                {mod.phaseLabel}
                              </span>
                              <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                                Step {idx + 1} of {COMPLIANCE_FLOW.length}
                              </span>
                              {mod.dpdpaSection ? (
                                <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                                  {mod.dpdpaSection}
                                </span>
                              ) : null}
                            </div>
                            <h3 className="text-xl font-bold text-[var(--text-primary)]">{mod.title}</h3>
                            <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                              {mod.description}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] p-4 space-y-3">
                          <p className="text-xs font-semibold text-[var(--text-primary)]">
                            When to use:{' '}
                            <span className="font-normal text-[var(--text-secondary)]">{mod.whenToUse}</span>
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {mod.roles.map((role) => (
                              <span
                                key={role}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-secondary)]"
                              >
                                {role}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]">
                            <span className="font-bold text-[var(--text-tertiary)] uppercase tracking-wide block mb-1">
                              Pulls from
                            </span>
                            <ul className="space-y-0.5 text-[var(--text-secondary)]">
                              {mod.feedsFrom.map((item) => (
                                <li key={item}>← {item}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="p-3 rounded-lg border border-[var(--border-default)] bg-[var(--surface-base)]">
                            <span className="font-bold text-[var(--text-tertiary)] uppercase tracking-wide block mb-1">
                              Feeds into
                            </span>
                            <ul className="space-y-0.5 text-[var(--text-secondary)]">
                              {mod.feedsInto.map((item) => (
                                <li key={item}>→ {item}</li>
                              ))}
                            </ul>
                          </div>
                        </div>

                        <Button variant="primary" size="sm" onClick={() => navigate(mod.route)}>
                          Open {mod.title} →
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Downstream callout */}
          <div
            onClick={() => navigate('/governance/guide')}
            className="p-6 rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50 hover:border-teal-300 hover:shadow-md cursor-pointer transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-teal-100 text-teal-600 border border-teal-200 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  Next: Governance & Executive Reporting
                  <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  After establishing compliance evidence, move to RoPA → DPIA → CISO → Compliance Dashboards
                  for board-level reporting and governance workflows.
                </p>
              </div>
            </div>
          </div>

          {/* Zone D — Persona Matrix */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Who Uses What</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Each role has primary modules — know where you belong in the compliance workflow.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PERSONAS.map((persona) => {
                const Icon = persona.icon;
                return (
                  <div
                    key={persona.role}
                    className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-3 hover:border-amber-400/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
                        <Icon className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-sm text-[var(--text-primary)]">{persona.role}</h4>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {persona.responsibility}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {persona.modules.map((mod) => (
                        <span
                          key={mod}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100"
                        >
                          {mod}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zone E — Interconnection Map */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">How Modules Connect</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                DPDPA Map sits at the center — statute coverage links to every compliance capability.
              </p>
            </div>
            <div className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 sm:p-10 pb-8">
              <svg
                viewBox="0 0 100 108"
                preserveAspectRatio="xMidYMid meet"
                className="w-full max-w-lg mx-auto block"
                style={{ minHeight: '260px' }}
                aria-hidden="true"
              >
                {CONNECTION_EDGES.map(([from, to]) => {
                  const fromNode = CONNECTION_NODES.find((n) => n.id === from)!;
                  const toNode = CONNECTION_NODES.find((n) => n.id === to)!;
                  return (
                    <line
                      key={`${from}-${to}`}
                      x1={fromNode.x}
                      y1={fromNode.y}
                      x2={toNode.x}
                      y2={toNode.y}
                      stroke="currentColor"
                      strokeWidth="0.35"
                      className="text-amber-400/50"
                      strokeDasharray="1.5 1"
                    />
                  );
                })}
                {CONNECTION_NODES.map((node) => (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.hub ? 6.5 : 5}
                      className={node.hub ? 'fill-amber-500' : 'fill-[var(--surface-card)]'}
                      stroke="currentColor"
                      strokeWidth="0.8"
                      style={{ color: node.hub ? '#f59e0b' : 'var(--border-default)' }}
                    />
                    <text
                      x={node.x}
                      y={node.y + (node.hub ? 11 : 9)}
                      textAnchor="middle"
                      fontSize="3"
                      className="fill-[var(--text-secondary)] font-semibold"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="text-center text-xs text-[var(--text-tertiary)] mt-6 px-2">
                Audit Log receives events from consent, safeguards, breach, and map reviews across the platform.
              </p>
            </div>
          </div>

          {/* Zone F — DPDPA Anchors */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-raised)] p-6 sm:p-8 space-y-6">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">DPDPA Legal Anchors</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2 p-4 rounded-xl border border-rose-100 bg-rose-50/50">
                <h4 className="text-sm font-semibold text-rose-800">Section 8 — Security Safeguards</h4>
                <p className="text-xs text-rose-900/70 leading-relaxed">
                  Data fiduciaries must implement reasonable security safeguards — tracked through the
                  Security Safeguards Hub with control status and evidence.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-red-100 bg-red-50/50">
                <h4 className="text-sm font-semibold text-red-800">Section 8(6) — Breach Notification</h4>
                <p className="text-xs text-red-900/70 leading-relaxed">
                  Personal data breaches must be reported to the Board and affected data principals —
                  managed through the 72-hour Breach Disclosure Wizard.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-orange-100 bg-orange-50/50">
                <h4 className="text-sm font-semibold text-orange-800">Section 8(5) — Audit Trail</h4>
                <p className="text-xs text-orange-900/70 leading-relaxed">
                  Organizations must maintain records demonstrating compliance — the hash-chained Audit Log
                  provides tamper-evident proof for regulators and auditors.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Zone G — Footer Resources */}
        <footer className="bg-[var(--surface-card)] border-t border-[var(--border-default)] py-12 px-8 mt-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex gap-4 items-start">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0 border border-amber-100">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Vajra AI Copilot</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Ask about statute coverage, breach timelines, or audit trail requirements.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/ai/copilot')}
                  className="text-xs font-bold text-amber-600 hover:underline inline-flex items-center gap-1"
                >
                  Ask Copilot <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0 border border-violet-100">
                <Layers className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Data Protection Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Section 8 technical controls start with data sources, inventory, and masking.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/data-protection/guide')}
                  className="text-xs font-bold text-violet-600 hover:underline inline-flex items-center gap-1"
                >
                  Go to Data Protection Guide <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl shrink-0 border border-teal-100">
                <Compass className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Governance Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Continue to RoPA, DPIA, and Compliance Dashboards for executive reporting.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/governance/guide')}
                  className="text-xs font-bold text-teal-600 hover:underline inline-flex items-center gap-1"
                >
                  Go to Governance Guide <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-[var(--status-info-bg)] text-[var(--status-info)] rounded-xl shrink-0">
                <Gauge className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Compliance Score</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  View your overall DPDPA posture snapshot in the Overview section.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/compliance/score')}
                  className="text-xs font-bold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
                >
                  View Compliance Score <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ConsentManagementGate>
  );
}
