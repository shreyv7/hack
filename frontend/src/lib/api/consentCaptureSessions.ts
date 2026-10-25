import { apiFetch } from '@/lib/api/client';
import type {
  ConsentCaptureSessionCreate,
  ConsentCaptureSessionRead,
} from '@/types/consentCaptureSession';

function withOrgQuery(path: string, orgId?: string): string {
  if (!orgId) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${encodeURIComponent(orgId)}`;
}

function withPropertyQuery(path: string, propertyId: string, orgId?: string): string {
  const base = withOrgQuery(path, orgId);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}property_id=${encodeURIComponent(propertyId)}`;
}

export function createAssistedSession(
  propertyId: string,
  body: ConsentCaptureSessionCreate,
  orgId?: string,
): Promise<ConsentCaptureSessionRead> {
  return apiFetch<ConsentCaptureSessionRead>(
    withPropertyQuery('/consent/banking/sessions', propertyId, orgId),
    { method: 'POST', body: JSON.stringify(body) },
  );
}

export function verifyAssistedOtp(
  propertyId: string,
  sessionId: string,
  otpCode: string,
  orgId?: string,
  autoComplete = true,
): Promise<ConsentCaptureSessionRead> {
  return apiFetch<ConsentCaptureSessionRead>(
    withPropertyQuery(`/consent/banking/sessions/${sessionId}/verify-otp`, propertyId, orgId),
    { method: 'POST', body: JSON.stringify({ otp_code: otpCode, auto_complete: autoComplete }) },
  );
}

export function resendAssistedOtp(
  propertyId: string,
  sessionId: string,
  orgId?: string,
): Promise<ConsentCaptureSessionRead> {
  return apiFetch<ConsentCaptureSessionRead>(
    withPropertyQuery(`/consent/banking/sessions/${sessionId}/resend-otp`, propertyId, orgId),
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function completeAssistedSession(
  propertyId: string,
  sessionId: string,
  orgId?: string,
): Promise<ConsentCaptureSessionRead> {
  return apiFetch<ConsentCaptureSessionRead>(
    withPropertyQuery(`/consent/banking/sessions/${sessionId}/complete`, propertyId, orgId),
    { method: 'POST', body: JSON.stringify({}) },
  );
}
