import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Building,
  Compass,
  Database,
  ClipboardCheck,
  FileCheck,
  Gauge,
  HelpCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';

type GovernancePhase = 'document' | 'assess' | 'govern' | 'secure' | 'report';

interface GovernanceModule {
  id: string;
  phase: GovernancePhase;
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

const PHASES: { id: GovernancePhase; label: string; number: number }[] = [
  { id: 'document', label: 'Document', number: 1 },
  { id: 'assess', label: 'Assess', number: 2 },
  { id: 'govern', label: 'Govern', number: 3 },
  { id: 'secure', label: 'Secure', number: 4 },
  { id: 'report', label: 'Report', number: 5 },
];

const GOVERNANCE_FLOW: GovernanceModule[] = [
  {
    id: 'ropa',
    phase: 'document',
    phaseLabel: 'Phase 1 — Document',
    phaseNumber: 1,
    title: 'RoPA Module',
    route: '/data/ropa',
    icon: BookOpen,
    description:
      'Maintain your Record of Processing Activities — the single source of truth for what data you collect, why, and who receives it.',
    whenToUse: 'Start here. Every governance workflow begins with documenting your processing activities.',
    roles: ['DPO', 'Privacy Team', 'Business Owners'],
    feedsFrom: ['Data Inventory', 'Discovery Suggestions'],
    feedsInto: ['DPIA Module', 'Policy Manager', 'Vendor Risk Intelligence', 'CISO Command Center'],
    accent: 'text-teal-600',
    accentBg: 'bg-teal-50',
    accentBorder: 'border-teal-200',
  },
  {
    id: 'dpia',
    phase: 'assess',
    phaseLabel: 'Phase 2 — Assess',
    phaseNumber: 2,
    title: 'DPIA Module',
    route: '/data/dpia',
    icon: FileCheck,
    description:
      'Conduct Data Protection Impact Assessments for high-risk processing operations flagged in your RoPA.',
    whenToUse: 'When RoPA activities involve sensitive data, large-scale processing, or new technologies.',
    roles: ['DPO', 'Legal Counsel', 'Business Unit Owners'],
    feedsFrom: ['RoPA high-risk activities'],
    feedsInto: ['CISO Command Center', 'Compliance Dashboards'],
    accent: 'text-violet-600',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
  },
  {
    id: 'policy',
    phase: 'govern',
    phaseLabel: 'Phase 3 — Govern',
    phaseNumber: 3,
    title: 'Policy Manager',
    route: '/data/policies',
    icon: Scale,
    description:
      'Draft, review, and publish privacy policies with version control and acknowledgement tracking. Generate policies directly from RoPA context.',
    whenToUse: 'After RoPA is established — formalize your privacy, retention, and vendor policies.',
    roles: ['Legal Counsel', 'DPO', 'HR'],
    feedsFrom: ['RoPA processing context'],
    feedsInto: ['CISO Command Center', 'Compliance Dashboards'],
    accent: 'text-amber-600',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
  },
  {
    id: 'vendor',
    phase: 'govern',
    phaseLabel: 'Phase 3 — Govern',
    phaseNumber: 3,
    title: 'Vendor Risk Intelligence',
    route: '/data/vendors',
    icon: Building,
    description:
      'Assess third-party processors, track DPA status, run security questionnaires, and map data flows from RoPA recipients.',
    whenToUse: 'When RoPA lists external recipients or you onboard new vendors handling personal data.',
    roles: ['DPO', 'Procurement', 'Security Team'],
    feedsFrom: ['RoPA recipients', 'Shadow-IT discovery'],
    feedsInto: ['CISO Command Center', 'Compliance Dashboards'],
    accent: 'text-rose-600',
    accentBg: 'bg-rose-50',
    accentBorder: 'border-rose-200',
  },
  {
    id: 'ciso',
    phase: 'secure',
    phaseLabel: 'Phase 4 — Secure',
    phaseNumber: 4,
    title: 'CISO Command Center',
    route: '/security/ciso',
    icon: ShieldCheck,
    description:
      'Integrated GRC cockpit — controls, evidence vault, risk matrix, remediation tasks, and posture scoring across DPDPA, ISO, CIS, and NIST.',
    whenToUse: 'Once policies, vendors, and assessments exist — operationalize security controls and evidence.',
    roles: ['CISO', 'Security Team', 'DPO'],
    feedsFrom: ['RoPA', 'DPIA', 'Policy Manager', 'Vendor Risk'],
    feedsInto: ['Compliance Dashboards'],
    accent: 'text-sky-600',
    accentBg: 'bg-sky-50',
    accentBorder: 'border-sky-200',
  },
  {
    id: 'dashboards',
    phase: 'report',
    phaseLabel: 'Phase 5 — Report',
    phaseNumber: 5,
    title: 'Compliance Dashboards',
    route: '/compliance/dashboards',
    icon: Gauge,
    description:
      'Build executive dashboards with drag-and-drop widgets, share with stakeholders, and export compliance metrics for board and audit reviews.',
    whenToUse: 'Last step — aggregate governance data into dashboards for leadership and auditors.',
    roles: ['DPO', 'CISO', 'Executives', 'Auditors'],
    feedsFrom: ['All governance modules'],
    feedsInto: ['Board reports', 'Audit packages'],
    accent: 'text-indigo-600',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-indigo-200',
  },
];

const PERSONAS: Persona[] = [
  {
    role: 'Data Protection Officer',
    icon: ShieldCheck,
    modules: ['RoPA', 'DPIA', 'Policy Manager', 'Compliance Dashboards'],
    responsibility: 'Owns the privacy program, RoPA accuracy, DPIA triggers, and regulatory reporting.',
  },
  {
    role: 'CISO / Security Lead',
    icon: ShieldCheck,
    modules: ['CISO Command Center', 'Vendor Risk', 'Compliance Dashboards'],
    responsibility: 'Manages controls, evidence, remediation, and security posture scoring.',
  },
  {
    role: 'Legal Counsel',
    icon: Scale,
    modules: ['Policy Manager', 'DPIA', 'RoPA'],
    responsibility: 'Reviews lawful basis, policy language, and high-risk assessment outcomes.',
  },
  {
    role: 'Procurement / Vendor Manager',
    icon: Building,
    modules: ['Vendor Risk Intelligence'],
    responsibility: 'Onboards processors, tracks DPAs, and completes vendor assessments.',
  },
  {
    role: 'Business Unit Owner',
    icon: Briefcase,
    modules: ['RoPA', 'DPIA'],
    responsibility: 'Documents processing activities and provides context for impact assessments.',
  },
  {
    role: 'Executive / Board',
    icon: Users,
    modules: ['Compliance Dashboards'],
    responsibility: 'Reviews aggregated compliance posture and governance KPIs.',
  },
];

const CONNECTION_NODES = [
  { id: 'ropa', label: 'RoPA', x: 50, y: 14, hub: true },
  { id: 'dpia', label: 'DPIA', x: 18, y: 40 },
  { id: 'policy', label: 'Policy', x: 50, y: 40 },
  { id: 'vendor', label: 'Vendor', x: 82, y: 40 },
  { id: 'ciso', label: 'CISO', x: 50, y: 66 },
  { id: 'dashboards', label: 'Dashboards', x: 50, y: 88 },
];

const CONNECTION_EDGES: [string, string][] = [
  ['ropa', 'dpia'],
  ['ropa', 'policy'],
  ['ropa', 'vendor'],
  ['dpia', 'ciso'],
  ['policy', 'ciso'],
  ['vendor', 'ciso'],
  ['ciso', 'dashboards'],
];

function scrollToModule(id: string): void {
  document.getElementById(`module-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function GovernanceGuide(): ReactElement {
  const navigate = useNavigate();

  return (
    <ConsentManagementGate
      title="Governance Guide"
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
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0f172a] via-[#134e4a] to-[#0d9488] text-white py-16 px-8 sm:px-12 rounded-b-[2rem] shadow-lg">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.2),transparent_50%)]" />
          <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-6 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-semibold uppercase tracking-wider backdrop-blur-md text-teal-200">
                <Compass className="w-3.5 h-3.5" />
                Governance Playbook
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Your DPDPA Governance Journey
              </h1>
              <p className="text-base text-teal-100/80 leading-relaxed">
                Six interconnected modules, one clear path. Start by documenting what you process, assess
                risks, govern through policies and vendors, secure with controls, then report to leadership.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="primary"
                  size="md"
                  className="bg-white text-[#0f172a] hover:bg-teal-50 shadow-lg font-semibold"
                  onClick={() => navigate('/data/ropa')}
                >
                  Start with RoPA →
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
                  <span className="w-7 h-7 rounded-full bg-teal-400/20 text-teal-200 text-xs font-bold flex items-center justify-center">
                    {phase.number}
                  </span>
                  <span className="text-sm font-semibold text-white/90">{phase.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-16" id="journey">
          {/* Zone B — Phase Timeline */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-4">
              Recommended Flow
            </h2>
            <div className="sticky top-0 z-40 bg-[var(--surface-base)]/90 backdrop-blur-md border border-[var(--border-default)] rounded-2xl py-5 px-6 shadow-sm overflow-x-auto">
              <div className="flex items-center gap-0 min-w-max">
                {PHASES.map((phase, idx) => {
                  const modulesInPhase = GOVERNANCE_FLOW.filter((m) => m.phase === phase.id);
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
                        <div className="w-10 h-10 rounded-full bg-teal-500/10 border-2 border-teal-500/40 text-teal-600 flex items-center justify-center text-sm font-bold group-hover:bg-teal-500 group-hover:text-white group-hover:border-teal-500 transition-all">
                          {phase.number}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-teal-600 transition-colors whitespace-nowrap">
                          {phase.label}
                        </span>
                      </button>
                      {idx < PHASES.length - 1 && (
                        <div className="w-12 sm:w-20 h-0.5 bg-gradient-to-r from-teal-400/60 to-teal-400/20 mx-2 sm:mx-4 mb-5" />
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
                Follow this order for the smoothest governance setup. Each module builds on the previous.
              </p>
            </div>

            {GOVERNANCE_FLOW.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.id}
                  id={`module-${mod.id}`}
                  className="scroll-mt-24 relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-teal-400 to-teal-600" />
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
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                                {mod.phaseLabel}
                              </span>
                              <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                                Step {idx + 1} of {GOVERNANCE_FLOW.length}
                              </span>
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

          {/* Zone D — Persona Matrix */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Who Uses What</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Each role has primary modules — know where you belong in the governance workflow.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PERSONAS.map((persona) => {
                const Icon = persona.icon;
                return (
                  <div
                    key={persona.role}
                    className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-3 hover:border-teal-400/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
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
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100"
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
                RoPA sits at the center — everything flows from documented processing activities.
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
                      strokeWidth="0.4"
                      className="text-teal-400/50"
                      strokeDasharray="1.5 1"
                    />
                  );
                })}
                {CONNECTION_NODES.map((node) => (
                  <g key={node.id}>
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={node.hub ? 7 : 5.5}
                      className={node.hub ? 'fill-teal-500' : 'fill-[var(--surface-card)]'}
                      stroke="currentColor"
                      strokeWidth="0.8"
                      style={{ color: node.hub ? '#14b8a6' : 'var(--border-default)' }}
                    />
                    <text
                      x={node.x}
                      y={node.y + (node.hub ? 12 : 10)}
                      textAnchor="middle"
                      fontSize="3.5"
                      className="fill-[var(--text-secondary)] font-semibold"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="text-center text-xs text-[var(--text-tertiary)] mt-6 px-2">
                Click any module card above to jump directly to that feature.
              </p>
            </div>
          </div>

          {/* Zone F — DPDPA Anchors */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-raised)] p-6 sm:p-8 space-y-6">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">DPDPA Legal Anchors</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2 p-4 rounded-xl border border-teal-100 bg-teal-50/50">
                <h4 className="text-sm font-semibold text-teal-800">Section 10 — RoPA</h4>
                <p className="text-xs text-teal-900/70 leading-relaxed">
                  Data fiduciaries must maintain a record of processing activities, including purposes,
                  categories of data, and recipients — the foundation of your RoPA Module.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-violet-100 bg-violet-50/50">
                <h4 className="text-sm font-semibold text-violet-800">DPIA Obligation</h4>
                <p className="text-xs text-violet-900/70 leading-relaxed">
                  Significant data fiduciaries must conduct impact assessments where processing poses
                  heightened risk — managed through the DPIA Module.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-sky-100 bg-sky-50/50">
                <h4 className="text-sm font-semibold text-sky-800">Accountability Principle</h4>
                <p className="text-xs text-sky-900/70 leading-relaxed">
                  Organizations must demonstrate compliance through documented policies, controls, and
                  audit trails — unified in CISO Command Center and Compliance Dashboards.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Zone G — Footer Resources */}
        <footer className="bg-[var(--surface-card)] border-t border-[var(--border-default)] py-12 px-8 mt-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex gap-4 items-start">
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl shrink-0 border border-teal-100">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Vajra AI Copilot</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Ask questions about DPDPA governance requirements, module workflows, or compliance best
                  practices.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/ai/copilot')}
                  className="text-xs font-bold text-teal-600 hover:underline inline-flex items-center gap-1"
                >
                  Ask Copilot <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0 border border-violet-100">
                <Database className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Data Protection Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Set up your data estate first — connect sources, catalogue assets, and classify PII before
                  starting governance workflows.
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
              <div className="p-3 bg-amber-50 text-amber-600 rounded-xl shrink-0 border border-amber-100">
                <ClipboardCheck className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Compliance Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Demonstrate accountability — map statutes, track safeguards, and maintain audit evidence
                  before executive reporting.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/compliance/guide')}
                  className="text-xs font-bold text-amber-600 hover:underline inline-flex items-center gap-1"
                >
                  Go to Compliance Guide <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="p-3 bg-[var(--status-info-bg)] text-[var(--status-info)] rounded-xl shrink-0">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Consent Setup Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  New to Vajra? Start with the consent and banner setup guide before diving into
                  governance modules.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/how-to-use')}
                  className="text-xs font-bold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1"
                >
                  Go to How to Use <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ConsentManagementGate>
  );
}
