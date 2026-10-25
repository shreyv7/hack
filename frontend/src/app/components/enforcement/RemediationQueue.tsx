import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { Purpose } from '@/types/consent';
import type { WithdrawalRemediationTask } from '@/types/enforcement';
import { WITHDRAWAL_ACTION_LABELS } from '@/app/components/enforcement/enforcementLabels';

const COLUMNS = [
  { key: 'pending' as const, label: 'Pending', icon: Clock, color: 'border-amber-300 bg-amber-50/50 dark:bg-amber-950/20' },
  { key: 'in_progress' as const, label: 'In progress', icon: AlertTriangle, color: 'border-blue-300 bg-blue-50/50 dark:bg-blue-950/20' },
  { key: 'completed' as const, label: 'Completed', icon: CheckCircle, color: 'border-green-300 bg-green-50/50 dark:bg-green-950/20' },
  { key: 'cancelled' as const, label: 'Cancelled', icon: XCircle, color: 'border-gray-300 bg-gray-50/50 dark:bg-gray-900/20' },
];

interface RemediationQueueProps {
  tasks: WithdrawalRemediationTask[];
  purposes: Purpose[];
  fieldLabels: Map<string, string>;
  loading?: boolean;
}

function isOverdue(task: WithdrawalRemediationTask): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.sla_due_at).getTime() < Date.now();
}

export function RemediationQueue({
  tasks,
  purposes,
  fieldLabels,
  loading,
}: RemediationQueueProps): ReactElement {
  const purposeMap = useMemo(() => new Map(purposes.map((p) => [p.id, p.name])), [purposes]);

  const byStatus = useMemo(() => {
    const map = new Map<string, WithdrawalRemediationTask[]>();
    for (const col of COLUMNS) map.set(col.key, []);
    for (const t of tasks) {
      const bucket = map.get(t.status);
      if (bucket) bucket.push(t);
    }
    return map;
  }, [tasks]);

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-[var(--text-secondary)]">Loading remediation queue…</div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const Icon = col.icon;
        const items = byStatus.get(col.key) ?? [];
        return (
          <div
            key={col.key}
            className={`rounded-xl border p-4 min-h-[280px] ${col.color}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 font-medium text-sm">
                <Icon className="size-4" />
                {col.label}
              </div>
              <span className="text-xs text-[var(--text-secondary)] bg-[var(--surface)] px-2 py-0.5 rounded-full">
                {items.length}
              </span>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {items.length === 0 && (
                <p className="text-xs text-[var(--text-tertiary)] py-4 text-center">No tasks</p>
              )}
              {items.map((task) => (
                <div
                  key={task.id}
                  className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-3 text-xs shadow-sm"
                >
                  <div className="font-medium mb-1">
                    {purposeMap.get(task.purpose_id) ?? 'Purpose'}
                  </div>
                  <div className="text-[var(--text-secondary)] mb-2">
                    {fieldLabels.get(task.inventory_field_id) ?? task.inventory_field_id.slice(0, 8)}
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)]">
                      {WITHDRAWAL_ACTION_LABELS[task.action]}
                    </span>
                    {isOverdue(task) && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--status-danger-bg)] text-[var(--status-danger)] font-semibold">
                        Overdue
                      </span>
                    )}
                  </div>
                  <div className="text-[var(--text-tertiary)]">
                    SLA: {new Date(task.sla_due_at).toLocaleString()}
                  </div>
                  <div className="font-mono text-[10px] text-[var(--text-tertiary)] mt-1 truncate">
                    Principal {task.principal_id.slice(0, 8)}…
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
