import type { ReactElement } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InputFieldType } from '@/types';

interface InputFieldProps {
  /** Field label rendered above the input. */
  label: string;
  /** HTML input type. */
  type: InputFieldType;
  /** Placeholder text shown when the field is empty. */
  placeholder?: string;
  /** Initial uncontrolled value. */
  value?: string;
  /** Helper text shown below the field when no error/success message is present. */
  hint?: string;
  /** Error message; applies danger border styling when set. */
  error?: string;
  /** Success message; applies success border styling when set. */
  success?: string;
}

/**
 * Labelled text input with hint, error, and success validation states.
 */
export function InputField({
  label,
  type,
  placeholder,
  value,
  hint,
  error,
  success,
}: InputFieldProps): ReactElement {
  const hasError = Boolean(error);
  const hasSuccess = Boolean(success);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-[var(--text-primary)]">{label}</label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          defaultValue={value}
          className={cn(
            'w-full px-3 py-2 rounded-lg text-sm transition-colors',
            'bg-[var(--surface-card)] text-[var(--text-primary)]',
            hasError
              ? 'border border-[var(--status-danger)]'
              : hasSuccess
                ? 'border border-[var(--status-success)]'
                : 'border border-[var(--border-default)]',
          )}
        />
        {hasError ? (
          <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[var(--status-danger)]" />
        ) : null}
        {hasSuccess ? (
          <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[var(--status-success)]" />
        ) : null}
      </div>
      {hint && !error && !success ? (
        <p className="text-xs text-[var(--text-secondary)]">{hint}</p>
      ) : null}
      {error ? <p className="text-xs text-[var(--status-danger)]">{error}</p> : null}
      {success ? <p className="text-xs text-[var(--status-success)]">{success}</p> : null}
    </div>
  );
}
