import type { PortalFormField, PortalFormSchema, VerificationMethod } from '@/types/dsar';
import {
  formatIndiaPhone,
  INDIA_PHONE_ERROR,
  isValidIndiaPhoneDigits,
  sanitizeIndiaPhoneInput,
} from '@/lib/phone/indiaPhone';

export const CORE_FIELD_KEYS = new Set([
  'requester_name',
  'requester_email',
  'requester_phone',
  'request_details',
]);

export function formHasEmailField(fields: PortalFormField[]): boolean {
  return fields.some((f) => f.key === 'requester_email');
}

export function formHasPhoneField(fields: PortalFormField[]): boolean {
  return fields.some((f) => f.key === 'requester_phone');
}

export function getVerificationOptions(fields: PortalFormField[]): {
  hasEmail: boolean;
  hasPhone: boolean;
  needsChoice: boolean;
  defaultMethod: VerificationMethod;
} {
  const hasEmail = formHasEmailField(fields);
  const hasPhone = formHasPhoneField(fields);
  const needsChoice = hasEmail && hasPhone;
  let defaultMethod: VerificationMethod = 'email';
  if (hasPhone && !hasEmail) defaultMethod = 'sms';
  return { hasEmail, hasPhone, needsChoice, defaultMethod };
}

export function resolveVerificationMethod(
  fields: PortalFormField[],
  values: Record<string, string | boolean>,
  chosen?: VerificationMethod
): VerificationMethod {
  const { hasEmail, hasPhone, needsChoice, defaultMethod } = getVerificationOptions(fields);
  if (needsChoice) {
    if (!chosen) throw new Error('Choose email or SMS verification');
    if (chosen === 'email' && !String(values.requester_email ?? '').trim()) {
      throw new Error('Email is required for email verification');
    }
    if (
      chosen === 'sms' &&
      !isValidIndiaPhoneDigits(sanitizeIndiaPhoneInput(String(values.requester_phone ?? '')))
    ) {
      throw new Error('Phone number is required for SMS verification');
    }
    return chosen;
  }
  if (
    defaultMethod === 'sms' &&
    !isValidIndiaPhoneDigits(sanitizeIndiaPhoneInput(String(values.requester_phone ?? '')))
  ) {
    throw new Error('Phone number is required');
  }
  if (defaultMethod === 'email' && !String(values.requester_email ?? '').trim()) {
    throw new Error('Email is required');
  }
  if (!hasEmail && !hasPhone) {
    throw new Error('Form must include email or phone for verification');
  }
  return defaultMethod;
}

export function mapFormValuesToSubmission(
  fields: PortalFormField[],
  values: Record<string, string | boolean>,
  verificationMethod?: VerificationMethod
): {
  requester_name: string;
  requester_email: string;
  requester_phone: string;
  request_details: string;
  extra_data: Record<string, unknown>;
  verification_method: VerificationMethod;
} {
  let requester_name = '';
  let requester_email = '';
  let requester_phone = '';
  let request_details = '';
  const extra_data: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = values[field.key];
    if (field.type === 'checkbox') {
      const checked = Boolean(raw);
      if (!CORE_FIELD_KEYS.has(field.key)) {
        extra_data[field.key] = checked;
      }
      continue;
    }
    let text = String(raw ?? '').trim();
    if (field.type === 'tel') {
      text = sanitizeIndiaPhoneInput(text);
      if (text && !isValidIndiaPhoneDigits(text)) {
        throw new Error(`${field.label}: ${INDIA_PHONE_ERROR}`);
      }
      if (field.required && !isValidIndiaPhoneDigits(text)) {
        throw new Error(`${field.label} is required`);
      }
      if (!text) continue;
      text = formatIndiaPhone(text);
    } else {
      if (field.required && !text) {
        throw new Error(`${field.label} is required`);
      }
      if (!text) continue;
    }

    switch (field.key) {
      case 'requester_name':
        requester_name = text;
        break;
      case 'requester_email':
        requester_email = text;
        break;
      case 'requester_phone':
        requester_phone = text;
        break;
      case 'request_details':
        request_details = text;
        break;
      default:
        extra_data[field.key] = text;
    }
  }

  if (!requester_name || !request_details) {
    throw new Error('Name and request details are required');
  }

  const method = resolveVerificationMethod(fields, values, verificationMethod);

  return {
    requester_name,
    requester_email,
    requester_phone,
    request_details,
    extra_data,
    verification_method: method,
  };
}

export function isFormValid(
  fields: PortalFormField[],
  values: Record<string, string | boolean>,
  verificationMethod?: VerificationMethod
): boolean {
  try {
    mapFormValuesToSubmission(fields, values, verificationMethod);
    return true;
  } catch {
    return false;
  }
}

export function emptyValuesForForm(schema: PortalFormSchema): Record<string, string | boolean> {
  const values: Record<string, string | boolean> = {};
  for (const field of schema.fields) {
    values[field.key] = field.type === 'checkbox' ? false : '';
  }
  return values;
}

export const PORTAL_FIELD_TYPE_OPTIONS: { value: PortalFormField['type']; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'tel', label: 'Phone' },
  { value: 'textarea', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];
