import type { ReactElement } from 'react';
import { useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { MaskingStrategy, PiiColumnTarget } from '@/types/masking';
import { STRATEGY_META } from '@/types/masking';

interface MaskingApplyModalProps {
  column: PiiColumnTarget;
  strategy: MaskingStrategy;
  onConfirm: () => void;
  onClose: () => void;
  applying: boolean;
}

export function MaskingApplyModal({
  column,
  strategy,
  onConfirm,
  onClose,
  applying,
}: MaskingApplyModalProps): ReactElement {
  const isProduction = column.environment === 'production';
  const isIrreversible = !STRATEGY_META[strategy].reversible;
  const [typed, setTyped] = useState('');
  const [dpoAck, setDpoAck] = useState(false);

  const canConfirm = !applying && (!isProduction || (typed === 'APPLY' && dpoAck));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)] shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="masking-apply-title"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 text-[var(--status-danger)]">
            <AlertTriangle className="size-5 shrink-0" />
            <h2 id="masking-apply-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Apply masking to live database
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-raised)] text-[var(--text-secondary)]"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-3 text-sm text-[var(--text-secondary)] mb-5">
          <p>
            This will <strong className="text-[var(--text-primary)]">permanently rewrite</strong> values in{' '}
            <code className="text-xs bg-[var(--surface-raised)] px-1 py-0.5 rounded">
              {column.table}.{column.column}
            </code>{' '}
            on <strong className="text-[var(--text-primary)]">{column.data_source_name}</strong>.
          </p>
          <p>
            Strategy: <strong className="text-[var(--text-primary)]">{STRATEGY_META[strategy].label}</strong>
            {isIrreversible && (
              <span className="ml-1 text-[var(--status-danger)]">(irreversible)</span>
            )}
          </p>
          {isProduction && (
            <div className="rounded-lg border border-[var(--status-danger)]/30 bg-[var(--status-danger-bg)] p-3 text-xs">
              Production source — requires DPO acknowledgment and typing APPLY to confirm.
            </div>
          )}
        </div>

        {isProduction && (
          <div className="space-y-3 mb-5">
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={dpoAck}
                onChange={(e) => setDpoAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>I confirm DPO / data owner approval for in-place masking on this production source.</span>
            </label>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Type APPLY to confirm
              </label>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-base)] text-sm"
                placeholder="APPLY"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 text-sm rounded-md bg-[var(--status-danger)] text-white hover:opacity-90 disabled:opacity-40 inline-flex items-center gap-1.5"
          >
            {applying && <Loader2 className="size-4 animate-spin" />}
            Apply to database
          </button>
        </div>
      </div>
    </div>
  );
}
