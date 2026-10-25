import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';
import {
  Settings,
  Globe,
  List,
  FileText,
  Layout,
  Activity,
  ArrowRight,
  BookOpen,
  HelpCircle,
  AlertCircle,
  Languages,
  Cpu,
  Compass,
  Layers,
  ClipboardCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/app/components/ui/Button';
import { useSetupStatus } from '@/hooks/useSetupStatus';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';

interface StepInfo {
  id: number;
  key:
    | 'step1_industry'
    | 'step2_property'
    | 'step3_adapters'
    | 'step3_purposes'
    | 'step4_notice'
    | 'step5_banner'
    | 'step6_translation'
    | 'step7_monitor';
  title: string;
  label: string;
  duration: string;
  whyItMatters: string;
  description: string;
  route: string;
  icon: any;
  riskIfSkipped: string;
}

const STEPS_CONFIG: StepInfo[] = [
  {
    id: 1,
    key: 'step1_industry',
    title: 'Configure Industry Sector',
    label: 'Foundation',
    duration: '2 mins',
    whyItMatters: 'DPDPA compliance requirements vary by industry. Setting this ensures your benchmarks and penalties are tailored for your company profile.',
    description: 'Select your primary and secondary industry sectors to configure the baseline obligations and benchmark requirements.',
    route: '/settings/industry',
    icon: Settings,
    riskIfSkipped: 'Compliance score benchmarks will be generic, and penalty calculations will not accurately reflect your sector risk.',
  },
  {
    id: 2,
    key: 'step2_property',
    title: 'Register Website or App Property',
    label: 'Connection',
    duration: '3 mins',
    whyItMatters: 'You must register the domains and apps where user data is collected to deploy the consent banners and capture consent legally.',
    description: 'Add your primary website domain or app bundle ID to retrieve the embed code, SDK configurations, and script tags.',
    route: '/integrations',
    icon: Globe,
    riskIfSkipped: 'You will not be able to deploy consent banners or track user consent choices on your live platform.',
  },
  {
    id: 3,
    key: 'step3_adapters',
    title: 'Configure Pluggable Provider Adapters',
    label: 'Adapters',
    duration: '3 mins',
    whyItMatters: 'Adapters allow pluggable provider integration (e.g. databases, SMS/Email services, and custom consent stores) across multiple platform modules.',
    description: 'Set up your pluggable providers and adapters to enable automated synchronization of consent state, logs, and notification integrations.',
    route: '/consent/provider-adapters',
    icon: Cpu,
    riskIfSkipped: 'Consent state changes and user activity will remain isolated, failing to propagate to your database or notifications system.',
  },
  {
    id: 4,
    key: 'step3_purposes',
    title: 'Register Data Collection Purposes',
    label: 'Purpose Registry',
    duration: '4 mins',
    whyItMatters: 'DPDPA Section 6 specifies that personal data can only be processed for specific, lawful purposes. These must be declared in advance.',
    description: 'List the specific purposes for collecting personal data (e.g., Marketing, Analytics) and the lawful basis for each.',
    route: '/consent/purposes',
    icon: List,
    riskIfSkipped: 'You cannot link lawful processing reasons to your notices, which violates Section 6 of the Act.',
  },
  {
    id: 5,
    key: 'step4_notice',
    title: 'Create & Publish Consent Notice',
    label: 'Consent Notice',
    duration: '5 mins',
    whyItMatters: 'Section 5 of the Act requires giving users a clear notice detailing the personal data collected, processing purposes, and how to exercise their rights.',
    description: 'Draft your compliance notice, associate your registered purposes, specify the Data Protection Officer contact, and translate into required languages.',
    route: '/consent/notices',
    icon: FileText,
    riskIfSkipped: 'Your consent banner will lack the mandatory legal notice, making any consent gathered invalid under Section 5.',
  },
  {
    id: 6,
    key: 'step5_banner',
    title: 'Build & Deploy Consent Banner',
    label: 'Consent Banner',
    duration: '5 mins',
    whyItMatters: 'The consent banner is the user-facing interface that requests consent. It must be clear, granular, and easy to withdraw.',
    description: 'Design the banner UI, link your published Consent Notice, map properties, configure blocker mode settings, and publish it live.',
    route: '/consent/banner',
    icon: Layout,
    riskIfSkipped: 'Users will visit your site without a consent banner, collecting cookies and data in direct violation of user consent requirements.',
  },
  {
    id: 7,
    key: 'step6_translation',
    title: 'Configure Multi-Language Translation',
    label: 'Language Translation',
    duration: '3 mins',
    whyItMatters: "DPDPA Section 6(3) mandates that the consent notice and banner must be available in English as well as any of the 22 languages specified in the Eighth Schedule to the Constitution, based on the user's preference.",
    description: 'Translate your consent notice and banner contents into scheduled Indian languages (like Hindi, Tamil, Telugu, etc.) using the Multi-Language Editor to comply with DPDPA multi-language requirements.',
    route: '/consent/languages',
    icon: Languages,
    riskIfSkipped: 'Gathering consent without offering regional language translations violates the language choice provisions of DPDPA.',
  },
  {
    id: 8,
    key: 'step7_monitor',
    title: 'Monitor & Store Consent Receipts',
    label: 'Proof Vault',
    duration: 'Ongoing',
    whyItMatters: 'Under DPDPA, the burden of proof is on the organization to show that consent was validly obtained. Proof Vault stores signed receipts securely.',
    description: 'Verify that consent receipts are flowing into the Proof Vault. Check your automated compliance score and track incoming DSAR queries.',
    route: '/consent/proof-vault',
    icon: Activity,
    riskIfSkipped: 'You will lack legally auditable proof of consent, exposing your organization to severe regulatory fines.',
  },
];

export function HowToUse(): ReactElement {
  const navigate = useNavigate();
  const { data: status, loading, error } = useSetupStatus();

  // Determine completion and next action
  const stepStates = STEPS_CONFIG.map((step) => {
    let isCompleted = status ? (status[step.key as keyof typeof status] ?? true) : false;
    return {
      ...step,
      isCompleted,
    };
  });


  // Find the first uncompleted step to mark as active
  let activeIndex = stepStates.findIndex((s) => !s.isCompleted);
  if (activeIndex === -1 && stepStates.length > 0) {
    // If all are completed, no active index (or set to last)
    activeIndex = 999; 
  }

  const completedCount = stepStates.filter((s) => s.isCompleted).length;
  const progressPercent = Math.round((completedCount / stepStates.length) * 100);

  return (
    <ConsentManagementGate
      title="How to Use Setup Guide"
      loading={loading}
      error={error}
      hasOrg={true}
      isSuperadmin={false}
      organizations={[]}
      selectedOrgId={undefined}
      onSelectOrg={() => {}}
    >
      <div className="min-h-screen bg-[var(--surface-base)]">
        {/* Zone A: Hero Banner */}
        <div className="relative overflow-hidden bg-gradient-to-br from-[#191636] to-[#4F46E5] text-white py-16 px-8 sm:px-12 rounded-b-[2rem] shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(111,95,240,0.15),transparent)] opacity-80" />
          <div className="relative max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
            <div className="space-y-6 max-w-xl">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/10 text-xs font-semibold uppercase tracking-wider backdrop-blur-md text-[#cfc9ff]">
                🚀 Quick Start Guide
              </span>
              <h1 className="text-4xl sm:text-5xl font-bold leading-tight">
                Get DPDPA-Compliant in {stepStates.length} Steps
              </h1>
              <p className="text-base text-[#b9b6cf] leading-relaxed">
                Welcome to Vajra. Follow this structured roadmap to configure your workspace, register your digital properties, set up legal consent notices, set up translations, and deploy compliant consent banners.
              </p>
              <div className="flex gap-4">
                <Button
                  variant="primary"
                  size="md"
                  className="bg-white text-[#191636] hover:bg-[#e7e6f2] shadow-lg font-semibold"
                  onClick={() => {
                    const firstPending = stepStates.find((s) => !s.isCompleted);
                    if (firstPending) {
                      navigate(firstPending.route);
                    } else {
                      navigate('/dashboard');
                    }
                  }}
                >
                  {completedCount === stepStates.length ? 'Go to Dashboard' : 'Start Next Step →'}
                </Button>
                <a
                  href="#journey"
                  className="inline-flex items-center justify-center px-4 py-2 border border-white/20 hover:border-white/40 rounded-lg text-sm font-semibold transition-colors"
                >
                  View Steps
                </a>
              </div>
            </div>

            {/* Circular Progress Ring */}
            <div className="flex flex-col items-center justify-center shrink-0">
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="absolute w-full h-full transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    className="stroke-white/10 fill-none"
                    strokeWidth="8"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="68"
                    className="stroke-[#8b5cf6] fill-none transition-all duration-1000 ease-out"
                    strokeWidth="8"
                    strokeDasharray={2 * Math.PI * 68}
                    strokeDashoffset={2 * Math.PI * 68 * (1 - progressPercent / 100)}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="text-center z-10">
                  <span className="text-4xl font-extrabold text-white">{progressPercent}%</span>
                  <p className="text-[10px] uppercase font-bold tracking-wider text-[#b9b6cf] mt-1">
                    Completed
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-[#cfc9ff] mt-4">
                {completedCount} of {stepStates.length} tasks complete
              </span>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-12 space-y-12" id="journey">
          {/* Zone B: Sticky Progress Tracker */}
          <div className="sticky top-0 z-40 bg-[var(--surface-base)]/85 backdrop-blur-md border border-[var(--border-default)] rounded-2xl py-4 px-6 shadow-sm flex items-center justify-between overflow-x-auto gap-4">
            {stepStates.map((step, idx) => {
              const isActive = idx === activeIndex;
              const isCompleted = step.isCompleted;
              return (
                <div
                  key={step.id}
                  onClick={() => navigate(step.route)}
                  className="flex items-center gap-2 cursor-pointer group shrink-0"
                >
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border',
                      isCompleted && 'bg-[var(--status-success)] border-[var(--status-success)] text-white',
                      isActive && 'bg-[var(--brand-primary)] border-[var(--brand-primary)] text-white ring-4 ring-[#5b54e6]/20 animate-pulse',
                      !isCompleted && !isActive && 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-tertiary)]',
                    )}
                  >
                    {isCompleted ? '✓' : step.id}
                  </div>
                  <div className="hidden sm:block text-left">
                    <div
                      className={cn(
                        'text-xs font-bold tracking-wide transition-colors',
                        isActive && 'text-[var(--brand-primary)]',
                        isCompleted && 'text-[var(--text-primary)]',
                        !isCompleted && !isActive && 'text-[var(--text-tertiary)]',
                      )}
                    >
                      {step.label}
                    </div>
                  </div>
                  {idx < stepStates.length - 1 && (
                    <div className="w-6 h-px bg-[var(--border-default)] ml-2 hidden md:block" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Zone C: Step Cards (Journey Roadmap) */}
          <div className="space-y-8">
            {stepStates.map((step, idx) => {
              const isActive = idx === activeIndex;
              const isCompleted = step.isCompleted;
              const IconComponent = step.icon;

              return (
                <div
                  key={step.id}
                  className={cn(
                    'relative overflow-hidden bg-[var(--surface-card)] border rounded-2xl p-6 sm:p-8 transition-all duration-300',
                    isCompleted && 'border-[var(--status-success)]/40 shadow-sm bg-gradient-to-r from-[var(--status-success-bg)]/20 to-[var(--surface-card)]',
                    isActive && 'border-[var(--brand-primary)] ring-2 ring-[var(--brand-primary)]/10 shadow-lg scale-[1.01]',
                    !isCompleted && !isActive && 'border-[var(--border-default)] opacity-75 hover:opacity-90',
                  )}
                >
                  {/* Top line Accent Bar */}
                  <div
                    className={cn(
                      'absolute left-0 top-0 bottom-0 w-1.5',
                      isCompleted && 'bg-[var(--status-success)]',
                      isActive && 'bg-[var(--brand-primary)]',
                      !isCompleted && !isActive && 'bg-[var(--border-default)]',
                    )}
                  />

                  {/* Watermark Step Number */}
                  <span className="absolute right-4 top-2 text-7xl font-extrabold text-[var(--text-primary)]/5 select-none pointer-events-none font-mono">
                    0{step.id}
                  </span>

                  <div className="flex flex-col lg:flex-row justify-between gap-8">
                    {/* Left Column: Info & Action */}
                    <div className="flex-1 space-y-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'p-2.5 rounded-xl border',
                            isCompleted && 'bg-[var(--status-success-bg)] border-[var(--status-success)]/20 text-[var(--status-success)]',
                            isActive && 'bg-[#e0e0ff] border-[var(--brand-primary)]/20 text-[var(--brand-primary)]',
                            !isCompleted && !isActive && 'bg-[var(--surface-base)] border-[var(--border-default)] text-[var(--text-secondary)]',
                          )}
                        >
                          <IconComponent className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold tracking-widest text-[var(--text-secondary)]">
                            Step {step.id} • {step.duration}
                          </div>
                          <h2 className="text-xl font-bold text-[var(--text-primary)]">{step.title}</h2>
                        </div>
                        <div className="ml-auto lg:hidden">
                          {isCompleted ? (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--status-success-bg)] text-[var(--status-success)] border border-[var(--status-success)]/20">
                              ✓ Completed
                            </span>
                          ) : isActive ? (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--status-info-bg)] text-[var(--status-info)] border border-[var(--status-info)]/20 animate-pulse">
                              ⚡ Active
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-[var(--surface-raised)] text-[var(--text-tertiary)] border border-[var(--border-default)]">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                        {step.description}
                      </p>

                      <div className="p-4 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl space-y-2">
                        <div className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">
                          🎯 Why it matters:
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {step.whyItMatters}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-3 pt-2">
                        <Button
                          variant={isCompleted ? 'secondary' : 'primary'}
                          size="sm"
                          className="font-semibold shadow-sm"
                          onClick={() => navigate(step.route)}
                        >
                          {isCompleted ? 'Review Config' : isActive ? 'Configure Now →' : 'Start Task'}
                        </Button>
                      </div>
                    </div>

                    {/* Right Column: Risk / Skip Warning */}
                    <div className="w-full lg:w-72 shrink-0 p-5 bg-[var(--status-danger-bg)]/20 border border-[var(--status-danger)]/10 rounded-xl space-y-3 flex flex-col justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-[var(--status-danger)] font-bold text-xs uppercase tracking-wide">
                          <AlertCircle className="w-4 h-4" />
                          Risk if skipped:
                        </div>
                        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                          {step.riskIfSkipped}
                        </p>
                      </div>
                      <div className="pt-4 border-t border-[var(--border-default)] text-right">
                        <span className="text-[11px] font-bold text-[var(--text-tertiary)] block">
                          EST. TIME: {step.duration}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Zone D: Skip Warning Summary Callouts */}
          <div className="bg-[var(--surface-card)] border border-[var(--border-default)] rounded-2xl p-6 sm:p-8 space-y-6">
            <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-[var(--status-warning)]" />
              Critical Obligations & Rules to Keep in Mind
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Section 5 (Notice)</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Every request for consent must be accompanied by or preceded by a notice containing descriptions of personal data collected and the purposes of processing.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Section 6 (Consent)</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Consent must be free, specific, informed, unconditional, and unambiguous, with clear affirmative action, limited to the specific data necessary.
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-[var(--text-primary)]">Section 6(4) (Withdrawal)</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Users have the right to withdraw consent at any time. The ease of withdrawal must be comparable to the ease with which consent was given.
                </p>
              </div>
            </div>
          </div>

          {/* Zone E: What Else Can I Do? (Explore More) */}
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-[var(--text-primary)]">Advanced Obligations & Governance</h3>

            <div
              onClick={() => navigate('/governance/guide')}
              className="p-6 rounded-2xl bg-gradient-to-r from-[#0f172a] to-[#134e4a] border border-teal-500/30 hover:border-teal-400/50 hover:shadow-lg cursor-pointer transition-all space-y-3 group text-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 w-11 h-11 rounded-xl bg-teal-400/20 text-teal-200 border border-teal-400/30 flex items-center justify-center">
                    <Compass className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-teal-300">Governance Playbook</span>
                    <h4 className="font-bold text-base text-white flex items-center gap-2">
                      Governance Module Flow Guide
                      <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-teal-400/20 text-teal-200 border border-teal-400/30 shrink-0">
                  Start here
                </span>
              </div>
              <p className="text-sm text-teal-100/80 leading-relaxed max-w-2xl">
                RoPA → DPIA → Policies → Vendor Risk → CISO → Dashboards. Learn the recommended flow, who
                owns each module, and how they connect.
              </p>
            </div>

            <div
              onClick={() => navigate('/data-protection/guide')}
              className="p-6 rounded-2xl bg-gradient-to-r from-[#1e1b4b] to-[#4338ca] border border-violet-500/30 hover:border-violet-400/50 hover:shadow-lg cursor-pointer transition-all space-y-3 group text-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 w-11 h-11 rounded-xl bg-violet-400/20 text-violet-200 border border-violet-400/30 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Data Protection Playbook</span>
                    <h4 className="font-bold text-base text-white flex items-center gap-2">
                      Data Protection Module Flow Guide
                      <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-violet-400/20 text-violet-200 border border-violet-400/30 shrink-0">
                  Start here
                </span>
              </div>
              <p className="text-sm text-violet-100/80 leading-relaxed max-w-2xl">
                Sources → Inventory → PII Scanner → Masking → Anonymisation → Retention → Children&apos;s
                Data. Learn the operational flow and who owns each module.
              </p>
            </div>

            <div
              onClick={() => navigate('/compliance/guide')}
              className="p-6 rounded-2xl bg-gradient-to-r from-[#431407] to-[#9f1239] border border-amber-500/30 hover:border-amber-400/50 hover:shadow-lg cursor-pointer transition-all space-y-3 group text-white"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 w-11 h-11 rounded-xl bg-amber-400/20 text-amber-200 border border-amber-400/30 flex items-center justify-center">
                    <ClipboardCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Compliance Playbook</span>
                    <h4 className="font-bold text-base text-white flex items-center gap-2">
                      Compliance Module Flow Guide
                      <ArrowRight className="w-4 h-4 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </h4>
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-400/20 text-amber-200 border border-amber-400/30 shrink-0">
                  Start here
                </span>
              </div>
              <p className="text-sm text-amber-100/80 leading-relaxed max-w-2xl">
                DPDPA Map → Security Safeguards → Breach Wizard → Audit Log. Learn the accountability
                layer — who owns each module and how they connect.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div
                onClick={() => navigate('/data/dpia')}
                className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[var(--brand-primary)]/50 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="p-2 w-10 h-10 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center justify-between">
                  DPIA Assessments
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Conduct Data Protection Impact Assessments (DPIA) for high-risk processing operations.
                </p>
              </div>

              <div
                onClick={() => navigate('/data/ropa')}
                className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[var(--brand-primary)]/50 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="p-2 w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center justify-between">
                  RoPA Module
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Maintain a detailed Record of Processing Activities (RoPA) for compliance audits.
                </p>
              </div>

              <div
                onClick={() => navigate('/rights/tracker')}
                className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-default)] hover:border-[var(--brand-primary)]/50 hover:shadow-md cursor-pointer transition-all space-y-3 group"
              >
                <div className="p-2 w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
                  <Activity className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center justify-between">
                  DSAR SLA Tracker
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Manage Data Principal Rights requests and track SLA compliance response times.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Zone D: Resources Footer */}
        <footer className="bg-[var(--surface-card)] border-t border-[var(--border-default)] py-12 px-8 mt-16">
          <div className="max-w-5xl mx-auto">
            <div className="flex gap-4 items-start max-w-md">
              <div className="p-3 bg-[var(--status-success-bg)] text-[var(--status-success)] rounded-xl shrink-0">
                <HelpCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">Support & Guidance</h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Have questions about DPDPA guidelines? Talk to our compliance experts or use the Vajra AI Copilot.
                </p>
                <span onClick={() => navigate('/ai/copilot')} className="text-xs font-bold text-[var(--brand-primary)] hover:underline inline-flex items-center gap-1 cursor-pointer">
                  Ask Copilot <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </ConsentManagementGate>
  );
}
