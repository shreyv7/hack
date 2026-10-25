import type {
  DenyBehavior,
  EnforcementMode,
  WithdrawalAction,
} from '@/types/enforcement';

export const ENFORCEMENT_MODE_LABELS: Record<EnforcementMode, string> = {
  disabled: 'Disabled',
  shadow: 'Shadow',
  enforced: 'Enforced',
};

export const DENY_BEHAVIOR_LABELS: Record<DenyBehavior, string> = {
  reject: 'Reject (403)',
  strip_fields: 'Strip fields',
  queue_pending: 'Queue pending',
};

export const WITHDRAWAL_ACTION_LABELS: Record<WithdrawalAction, string> = {
  suppress: 'Suppress (stop use, keep data)',
  mask: 'Mask',
  anonymize: 'Anonymize',
  delete: 'Delete',
  pseudonymize: 'Pseudonymize',
  flag_manual_review: 'Manual review',
};

export function enforcementModeBadge(mode: EnforcementMode): string {
  if (mode === 'enforced') {
    return 'bg-[var(--status-success-bg)] text-[var(--status-success)]';
  }
  if (mode === 'shadow') {
    return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)]';
  }
  return 'bg-[var(--surface-raised)] text-[var(--text-secondary)]';
}

export function p95LatencyMs(latencies: number[]): number | null {
  const values = latencies.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const idx = Math.min(values.length - 1, Math.ceil(values.length * 0.95) - 1);
  return values[Math.max(0, idx)] ?? null;
}
