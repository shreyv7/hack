import type { ReactNode } from 'react';
import { Activity, Radio, ShieldCheck, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export function HealthcarePage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-full w-full max-w-[1280px] p-4 text-[var(--text-primary)] sm:p-6 lg:p-8">
      {children}
    </div>
  );
}

export function HealthcareHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--brand-primary)]">
          <ShieldCheck className="size-4" />
          {eyebrow}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap gap-2 xl:max-w-sm xl:justify-end">{actions}</div> : null}
    </header>
  );
}

export function HealthcarePanel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)]', className)}>
      {children}
    </section>
  );
}

export function LiveBadge({ label = 'Mock gateway live' }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--status-success)]/25 bg-[var(--status-success-bg)] px-3 py-1.5 text-xs font-medium text-[var(--status-success)]">
      <Radio className="size-3.5" />
      {label}
    </span>
  );
}

export function GemmaBadge() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[color:var(--status-ai)]/25 bg-[var(--status-ai-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--status-ai)]">
      <Sparkles className="size-3" /> Gemma 4
    </span>
  );
}

export function MetricPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] px-4 py-3">
      <div className="text-lg font-semibold text-[var(--text-primary)]">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{label}</div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-[var(--text-secondary)]">
      <Activity className="size-5 animate-pulse text-[var(--brand-primary)]" /> {label}
    </div>
  );
}
