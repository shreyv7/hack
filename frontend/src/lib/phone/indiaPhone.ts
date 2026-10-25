export const INDIA_PHONE_PREFIX = '+91';
export const INDIA_PHONE_DIGIT_LENGTH = 10;
export const INDIA_PHONE_ERROR = 'Phone number must be +91 followed by exactly 10 digits';

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** Extract the 10-digit local part for input display. */
export function extractLocalDigits(value: string): string {
  const digits = digitsOnly(value);
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2, 12);
  }
  if (digits.length <= 10) {
    return digits.slice(0, 10);
  }
  return digits.slice(-10);
}

export function isValidIndiaPhoneDigits(digits: string): boolean {
  return /^\d{10}$/.test(digits);
}

export function formatIndiaPhone(digits: string): string {
  if (!isValidIndiaPhoneDigits(digits)) {
    throw new Error(INDIA_PHONE_ERROR);
  }
  return `${INDIA_PHONE_PREFIX}${digits}`;
}

export function tryFormatIndiaPhone(value: string): string | null {
  const digits = extractLocalDigits(value.trim());
  if (!digits) return null;
  if (!isValidIndiaPhoneDigits(digits)) {
    throw new Error(INDIA_PHONE_ERROR);
  }
  return formatIndiaPhone(digits);
}

export function sanitizeIndiaPhoneInput(value: string): string {
  return extractLocalDigits(value);
}
