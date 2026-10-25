import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Baby,
  Clock,
  Code,
  Compass,
  ClipboardCheck,
  Database,
  HelpCircle,
  Layers,
  Lock,
  Plug,
  Scale,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';

type DataProtectionPhase =
  | 'connect'
  | 'catalogue'
  | 'classify'
  | 'protect'
  | 'lifecycle'
  | 'special';

interface DataProtectionModule {
  id: string;
  phase: DataProtectionPhase;
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

const PHASES: { id: DataProtectionPhase; label: string; number: number }[] = [
  { id: 'connect', label: 'Connect', number: 1 },
  { id: 'catalogue', label: 'Catalogue', number: 2 },
  { id: 'classify', label: 'Classify', number: 3 },
  { id: 'protect', label: 'Protect', number: 4 },
  { id: 'lifecycle', label: 'Lifecycle', number: 5 },
  { id: 'special', label: 'Special', number: 6 },
];

const DATA_PROTECTION_FLOW: DataProtectionModule[] = [
  {
    id: 'sources',
    phase: 'connect',
    phaseLabel: 'Phase 1 — Connect',
    phaseNumber: 1,
    title: 'Data Sources',
    route: '/data/sources',
    icon: Plug,
    description:
      'Register databases, cloud stores, files, APIs, and logs as scan and governance targets. Test connections and run schema discovery.',
    whenToUse: 'Start here. Connect every system that stores or processes personal data before cataloguing.',
    roles: ['Data Engineer', 'Platform Team'],
    feedsFrom: [],
    feedsInto: [
      'Data Inventory',
      'PII Scanner',
      'Data Masking',
      'Data Anonymisation',
      'Retention Policies',
      "Children's Data",
      'RoPA discovery',
    ],
    accent: 'text-indigo-600',
    accentBg: 'bg-indigo-50',
    accentBorder: 'border-indigo-200',
  },
  {
    id: 'inventory',
    phase: 'catalogue',
    phaseLabel: 'Phase 2 — Catalogue',
    phaseNumber: 2,
    title: 'Data Inventory',
    route: '/data/inventory',
    icon: Database,
    description:
      'Catalogue data assets, classify fields by sensitivity and PII category, and import schemas from connected sources.',
    whenToUse: 'After sources are connected — build your asset register and initial field classifications.',
    roles: ['DPO', 'Data Engineer'],
    feedsFrom: ['Data Sources (schema import)', 'PII Scanner (classification upsert)'],
    feedsInto: [
      'PII Scanner',
      'Data Masking',
      'Data Anonymisation',
      'Retention Policies',
      "Children's Data",
      'RoPA Module',
    ],
    accent: 'text-violet-600',
    accentBg: 'bg-violet-50',
    accentBorder: 'border-violet-200',
  },
  {
    id: 'scanner',
    phase: 'classify',
    phaseLabel: 'Phase 3 — Classify',
    phaseNumber: 3,
    title: 'PII Scanner',
    route: '/scanner/pii',
    icon: Search,
    description:
      'Sample real values from connected sources to verify PII categories and upgrade inventory classifications with data-verified results.',
    whenToUse: 'After inventory is populated — validate classifications with actual data sampling, not name guesses alone.',
    roles: ['DPO', 'Security Engineer'],
    feedsFrom: ['Data Sources'],
    feedsInto: ['Data Inventory (field upsert)', 'RoPA discovery'],
    accent: 'text-purple-600',
    accentBg: 'bg-purple-50',
    accentBorder: 'border-purple-200',
  },
  {
    id: 'masking',
    phase: 'protect',
    phaseLabel: 'Phase 4 — Protect',
    phaseNumber: 4,
    title: 'Data Masking',
    route: '/data/masking',
    icon: Lock,
    description:
      'Define per-PII-category transform rules — mask, redact, hash, encrypt, or generalize — for reversible protection of live data.',
    whenToUse: 'After PII categories are confirmed — configure how sensitive fields are protected in production.',
    roles: ['Security Engineer', 'App Developer'],
    feedsFrom: ['PII categories from Scanner/Inventory'],
    feedsInto: ['Retention Policies (anonymize path)', 'Data Anonymisation'],
    dpdpaSection: 'Section 8 — Security Safeguards',
    accent: 'text-fuchsia-600',
    accentBg: 'bg-fuchsia-50',
    accentBorder: 'border-fuchsia-200',
  },
  {
    id: 'anonymisation',
    phase: 'protect',
    phaseLabel: 'Phase 4 — Protect',
    phaseNumber: 4,
    title: 'Data Anonymisation',
    route: '/data/anonymisation',
    icon: Shield,
    description:
      'Run permanent anonymisation jobs using k-anonymity, l-diversity, or differential privacy for analytics and ML use cases.',
    whenToUse: 'When you need irreversible anonymised datasets — distinct from reversible masking for live systems.',
    roles: ['Data Engineer', 'DPO'],
    feedsFrom: ['Data Sources', 'Data Inventory assets'],
    feedsInto: ['Anonymised datasets + evidence'],
    dpdpaSection: 'Section 8 — Security Safeguards',
    accent: 'text-blue-600',
    accentBg: 'bg-blue-50',
    accentBorder: 'border-blue-200',
  },
  {
    id: 'retention',
    phase: 'lifecycle',
    phaseLabel: 'Phase 5 — Lifecycle',
    phaseNumber: 5,
    title: 'Retention Policies',
    route: '/data/retention',
    icon: Clock,
    description:
      'Bind delete, anonymize, archive, or manual-review rules to a source, inventory asset, and trigger field. Automated scheduler runs due policies.',
    whenToUse: 'After assets and fields are classified — define how long data is kept and what happens when it expires.',
    roles: ['DPO', 'Legal', 'Data Engineer'],
    feedsFrom: ['Data Sources', 'Data Inventory', 'Data Masking rules'],
    feedsInto: ['Automated delete/anonymize runs'],
    dpdpaSection: 'Section 8(7) — Retention & Erasure',
    accent: 'text-amber-600',
    accentBg: 'bg-amber-50',
    accentBorder: 'border-amber-200',
  },
  {
    id: 'children',
    phase: 'special',
    phaseLabel: 'Phase 6 — Special Categories',
    phaseNumber: 6,
    title: "Children's Data",
    route: '/data/children',
    icon: Baby,
    description:
      'Detect minors from sources, manage parental consent lifecycle, and wire the enforcement API to block restricted processing for children.',
    whenToUse: 'If your platform processes data of users under 18 — mandatory under DPDPA Section 9.',
    roles: ['DPO', 'Product Owner', 'Engineering'],
    feedsFrom: ['Data Sources', 'Data Inventory (DOB fields)'],
    feedsInto: ['Public enforcement API', 'Consent flows'],
    dpdpaSection: "Section 9 — Children's Data",
    accent: 'text-orange-600',
    accentBg: 'bg-orange-50',
    accentBorder: 'border-orange-200',
  },
];

const PERSONAS: Persona[] = [
  {
    role: 'DPO / Privacy Lead',
    icon: ShieldCheck,
    modules: ['Data Inventory', 'PII Scanner', 'Retention Policies', "Children's Data"],
    responsibility: 'Owns classification accuracy, retention rules, and children\'s data compliance.',
  },
  {
    role: 'Data Engineer',
    icon: Code,
    modules: ['Data Sources', 'Data Inventory', 'Data Anonymisation'],
    responsibility: 'Connects systems, imports schemas, and runs anonymisation jobs.',
  },
  {
    role: 'Security Engineer',
    icon: Lock,
    modules: ['PII Scanner', 'Data Masking'],
    responsibility: 'Verifies sensitive data exposure and defines transform rules.',
  },
  {
    role: 'App Developer',
    icon: Code,
    modules: ['Data Masking', "Children's Data enforcement API"],
    responsibility: 'Integrates masking and minor-blocking into application flows.',
  },
  {
    role: 'Legal / Compliance',
    icon: Scale,
    modules: ['Retention Policies', "Children's Data"],
    responsibility: 'Reviews retention schedules and children\'s consent obligations.',
  },
  {
    role: 'Product Owner',
    icon: Users,
    modules: ["Children's Data", 'Data Inventory'],
    responsibility: 'Ensures product flows respect minor data rules and field classifications.',
  },
];

const CONNECTION_NODES = [
  { id: 'sources', label: 'Sources', x: 50, y: 12, hub: true },
  { id: 'inventory', label: 'Inventory', x: 50, y: 30 },
  { id: 'scanner', label: 'Scanner', x: 18, y: 48 },
  { id: 'masking', label: 'Masking', x: 50, y: 48 },
  { id: 'anonymisation', label: 'Anonymise', x: 82, y: 48 },
  { id: 'retention', label: 'Retention', x: 35, y: 68 },
  { id: 'children', label: 'Children', x: 65, y: 68 },
  { id: 'ropa', label: 'RoPA', x: 50, y: 88 },
];

const CONNECTION_EDGES: [string, string][] = [
  ['sources', 'inventory'],
  ['inventory', 'scanner'],
  ['inventory', 'masking'],
  ['inventory', 'anonymisation'],
  ['scanner', 'inventory'],
  ['masking', 'retention'],
  ['inventory', 'retention'],
  ['sources', 'children'],
  ['inventory', 'children'],
  ['inventory', 'ropa'],
];

function scrollToModule(id: string): void {
  document.getElementById(`module-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function DataProtectionGuide(): ReactElement {
  const navigate = useNavigate();

  return (
    <ConsentManagementGate
      title="Data Protection Guide"
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
        <div className="relative overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#6366f1] text-white py-16 px-8 sm:px-12 rounded-b-[2rem] shadow-lg">
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.4) 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.25),transparent_55%)]" />
          <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
            <div className="space-y-6 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-semibold uppercase tracking-wider backdrop-blur-md text-violet-200">
                <Layers className="w-3.5 h-3.5" />
                Data Protection Playbook
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Your Data Protection Journey
              </h1>
              <p className="text-base text-violet-100/80 leading-relaxed">
                Seven interconnected modules, one clear path. Connect your data estate, catalogue and
                classify personal data, protect it with masking and anonymisation, manage lifecycles, then
                handle children&apos;s data obligations.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="primary"
                  size="md"
                  className="bg-white text-[#1e1b4b] hover:bg-violet-50 shadow-lg font-semibold"
                  onClick={() => navigate('/data/sources')}
                >
                  Start with Data Sources →
                </Button>
                <a
                  href="#journey"
                  className="inline-flex items-center justify-center px-4 py-2 border border-white/25 hover:border-white/50 rounded-lg text-sm font-semibold transition-colors"
                >
                  Explore the Flow
                </a>
              </div>
            </div>

            <div className="hidden md:flex flex-col gap-2.5 shrink-0">
              {PHASES.map((phase) => (
                <div
                  key={phase.id}
                  className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10"
                >
                  <span className="w-7 h-7 rounded-full bg-violet-400/20 text-violet-200 text-xs font-bold flex items-center justify-center">
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
                  const modulesInPhase = DATA_PROTECTION_FLOW.filter((m) => m.phase === phase.id);
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
                        <div className="w-10 h-10 rounded-full bg-violet-500/10 border-2 border-violet-500/40 text-violet-600 flex items-center justify-center text-sm font-bold group-hover:bg-violet-500 group-hover:text-white group-hover:border-violet-500 transition-all">
                          {phase.number}
                        </div>
                        <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-violet-600 transition-colors whitespace-nowrap">
                          {phase.label}
                        </span>
                      </button>
                      {idx < PHASES.length - 1 && (
                        <div className="w-8 sm:w-14 h-0.5 bg-gradient-to-r from-violet-400/60 to-violet-400/20 mx-2 sm:mx-3 mb-5" />
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
                Follow this operational order — not the sidebar order. Each module builds on the previous.
              </p>
            </div>

            {DATA_PROTECTION_FLOW.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={mod.id}
                  id={`module-${mod.id}`}
                  className="scroll-mt-24 relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-violet-400 to-indigo-600" />
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
                              <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-100">
                                {mod.phaseLabel}
                              </span>
                              <span className="text-[10px] font-bold text-[var(--text-tertiary)]">
                                Step {idx + 1} of {DATA_PROTECTION_FLOW.length}
                              </span>
                              {mod.dpdpaSection ? (
                                <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
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
                            {mod.feedsFrom.length > 0 ? (
                              <ul className="space-y-0.5 text-[var(--text-secondary)]">
                                {mod.feedsFrom.map((item) => (
                                  <li key={item}>← {item}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-[var(--text-tertiary)] italic">Foundation module — start here</p>
                            )}
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
            className="p-6 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 hover:border-violet-300 hover:shadow-md cursor-pointer transition-all group"
          >
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-violet-100 text-violet-600 border border-violet-200 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                  Next: Governance Module Flow
                  <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Once your data estate is catalogued and classified, move to RoPA (fed by Inventory + PII
                  findings) → DPIA → Policy Manager → CISO → Dashboards.
                </p>
              </div>
            </div>
          </div>

          {/* Zone D — Persona Matrix */}
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">Who Uses What</h2>
              <p className="text-sm text-[var(--text-secondary)] mt-1">
                Each role has primary modules — know where you belong in the data protection workflow.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {PERSONAS.map((persona) => {
                const Icon = persona.icon;
                return (
                  <div
                    key={persona.role}
                    className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] space-y-3 hover:border-violet-400/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-violet-50 text-violet-600 border border-violet-100">
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
                          className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100"
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
                Data Sources sits at the center — everything flows from connected systems.
              </p>
            </div>
            <div className="relative rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 sm:p-10 pb-8">
              <svg
                viewBox="0 0 100 108"
                preserveAspectRatio="xMidYMid meet"
                className="w-full max-w-lg mx-auto block"
                style={{ minHeight: '280px' }}
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
                      className="text-violet-400/50"
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
                      className={node.hub ? 'fill-violet-500' : 'fill-[var(--surface-card)]'}
                      stroke="currentColor"
                      strokeWidth="0.8"
                      style={{ color: node.hub ? '#8b5cf6' : 'var(--border-default)' }}
                    />
                    <text
                      x={node.x}
                      y={node.y + (node.hub ? 11 : 9)}
                      textAnchor="middle"
                      fontSize="3.2"
                      className="fill-[var(--text-secondary)] font-semibold"
                    >
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="text-center text-xs text-[var(--text-tertiary)] mt-6 px-2">
                Inventory and PII findings feed downstream into the Governance RoPA module.
              </p>
            </div>
          </div>

          {/* Zone F — DPDPA Anchors */}
          <div className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-[var(--surface-card)] to-[var(--surface-raised)] p-6 sm:p-8 space-y-6">
            <h3 className="text-lg font-bold text-[var(--text-primary)]">DPDPA Legal Anchors</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2 p-4 rounded-xl border border-violet-100 bg-violet-50/50">
                <h4 className="text-sm font-semibold text-violet-800">Section 8 — Security Safeguards</h4>
                <p className="text-xs text-violet-900/70 leading-relaxed">
                  Data fiduciaries must implement appropriate technical and organisational measures to
                  protect personal data — addressed through Data Masking and Data Anonymisation.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-amber-100 bg-amber-50/50">
                <h4 className="text-sm font-semibold text-amber-800">Section 8(7) — Retention & Erasure</h4>
                <p className="text-xs text-amber-900/70 leading-relaxed">
                  Personal data must not be retained beyond the period necessary for the stated purpose —
                  enforced through Retention Policies with automated delete and anonymize actions.
                </p>
              </div>
              <div className="space-y-2 p-4 rounded-xl border border-orange-100 bg-orange-50/50">
                <h4 className="text-sm font-semibold text-orange-800">Section 9 — Children&apos;s Data</h4>
                <p className="text-xs text-orange-900/70 leading-relaxed">
                  Verifiable parental consent is required before processing personal data of children —
                  managed through the Children&apos;s Data module and enforcement API.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Zone G — Footer Resources */}
        <footer className="bg-[var(--surface-card)] border-t border-[var(--border-default)] py-12 px-8 mt-8">
          <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="flex gap-4 items-start">
              <div className="p-3 bg-violet-50 text-violet-600 rounded-xl shrink-0 border border-violet-100">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Vajra AI Copilot</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Ask questions about data classification, retention rules, or children&apos;s data obligations.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/ai/copilot')}
                  className="text-xs font-bold text-violet-600 hover:underline inline-flex items-center gap-1"
                >
                  Ask Copilot <ArrowRight className="w-3 h-3" />
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
                  Section 8 safeguards and audit trail — map statutes and demonstrate accountability.
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
              <div className="p-3 bg-teal-50 text-teal-600 rounded-xl shrink-0 border border-teal-100">
                <Compass className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Governance Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  After cataloguing your data estate, continue with RoPA, DPIA, and compliance reporting.
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
                <HelpCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Consent Setup Guide</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  New to Vajra? Start with consent notices and banner deployment first.
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
