import type { ReactNode } from 'react';
import { Activity, Radio, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HealthcarePage({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-full overflow-hidden bg-[#07110f] text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(16,185,129,0.13),transparent_31%),radial-gradient(circle_at_90%_12%,rgba(34,211,238,0.09),transparent_29%),linear-gradient(180deg,#081411_0%,#07100f_46%,#09100f_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="relative mx-auto w-full max-w-[1500px] px-5 py-6 lg:px-8 lg:py-8">{children}</div>
    </div>
  );
}

export function HealthcareHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
          <ShieldCheck className="size-4" />
          {eyebrow}
        </div>
        <h1 className="max-w-4xl text-3xl font-semibold tracking-[-0.035em] text-white md:text-[40px] md:leading-[1.08]">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400 md:text-[15px]">{description}</p>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}

export function GlassPanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-white/[0.08] bg-white/[0.045] shadow-[0_20px_60px_rgba(0,0,0,.2)] backdrop-blur-xl', className)}>
      {children}
    </section>
  );
}

export function LiveBadge({ label = 'Mock gateway live' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-xs font-semibold text-emerald-300">
      <Radio className="size-3.5 animate-pulse" />
      {label}
    </span>
  );
}

export function GemmaBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">
      <Sparkles className="size-3" /> Gemma 4
    </span>
  );
}

export function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3">
      <div className="text-lg font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-slate-400">
      <Activity className="size-5 animate-pulse text-emerald-400" /> {label}
    </div>
  );
}
