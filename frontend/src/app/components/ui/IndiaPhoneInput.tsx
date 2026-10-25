import type { ReactElement } from 'react';
import {
  INDIA_PHONE_DIGIT_LENGTH,
  INDIA_PHONE_PREFIX,
  extractLocalDigits,
  sanitizeIndiaPhoneInput,
} from '@/lib/phone/indiaPhone';

interface IndiaPhoneInputProps {
  value: string;
  onChange: (digits: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

export function IndiaPhoneInput({
  value,
  onChange,
  className = '',
  inputClassName = '',
  placeholder = '9876543210',
  disabled = false,
  id,
}: IndiaPhoneInputProps): ReactElement {
  const digits = extractLocalDigits(value);

  return (
    <div className={`flex ${className}`}>
      <span
        className="inline-flex items-center px-3 py-2 border border-r-0 border-[var(--border-default)] rounded-l-md bg-[var(--surface-raised)] text-sm text-[var(--text-secondary)] select-none"
        aria-hidden
      >
        {INDIA_PHONE_PREFIX}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={INDIA_PHONE_DIGIT_LENGTH}
        value={digits}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(sanitizeIndiaPhoneInput(event.target.value))}
        className={
          inputClassName ||
          'flex-1 min-w-0 px-3 py-2 border border-[var(--border-default)] rounded-r-md'
        }
      />
    </div>
  );
}
