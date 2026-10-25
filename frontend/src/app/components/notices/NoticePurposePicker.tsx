import type { ReactElement } from 'react';
import type { Purpose } from '@/types/consent';

interface NoticePurposePickerProps {
  purposes: Purpose[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function NoticePurposePicker({
  purposes,
  selectedIds,
  onChange,
  disabled = false,
}: NoticePurposePickerProps): ReactElement {
  const toggle = (id: string) => {
    if (disabled) return;
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (purposes.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">
        No purposes in the registry yet. Add purposes under Purpose Registry before linking them to
        this notice.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {purposes.map((purpose) => {
        const checked = selectedIds.includes(purpose.id);
        return (
          <label
            key={purpose.id}
            className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
              checked
                ? 'border-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/20 dark:border-indigo-800'
                : 'border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-raised)]'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={disabled}
              onChange={() => toggle(purpose.id)}
              className="mt-1 rounded border-[var(--border-default)]"
            />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[var(--text-primary)]">{purpose.name}</div>
              <div className="text-xs text-[var(--text-secondary)] mt-1">
                {purpose.legal_basis === 'consent' ? 'Consent' : 'Legitimate use'} ·{' '}
                {purpose.retention_period || 'No retention set'}
              </div>
              {purpose.data_categories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {purpose.data_categories.map((cat) => (
                    <span
                      key={cat}
                      className="text-xs px-2 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border-default)]"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </label>
        );
      })}
    </div>
  );
}
