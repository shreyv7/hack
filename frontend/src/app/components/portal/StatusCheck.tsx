import type { ReactElement } from 'react';
import { useState } from 'react';
import { X } from 'lucide-react';
import type { StatusCheckResponse, VerificationMethod } from '@/types/dsar';
import { RIGHT_TYPE_LABELS, STATUS_LABELS } from '@/types/dsar';
import { OtpVerification } from '@/app/components/portal/OtpVerification';
import { IndiaPhoneInput } from '@/app/components/ui/IndiaPhoneInput';
import {
  formatIndiaPhone,
  INDIA_PHONE_ERROR,
  isValidIndiaPhoneDigits,
} from '@/lib/phone/indiaPhone';

type ContactMode = 'email' | 'phone';

interface StatusCheckProps {
  orgSlug: string;
  onClose: () => void;
  onCheck: (
    trackingId: string,
    contact: { email?: string; phone?: string }
  ) => Promise<StatusCheckResponse>;
  onVerify: (
    trackingId: string,
    contact: { email?: string; phone?: string },
    otp: string
  ) => Promise<void>;
  onResend: (
    trackingId: string,
    contact: { email?: string; phone?: string }
  ) => Promise<void>;
}

export function StatusCheck({
  onClose,
  onCheck,
  onVerify,
  onResend,
}: StatusCheckProps): ReactElement {
  const [trackingId, setTrackingId] = useState('');
  const [contactMode, setContactMode] = useState<ContactMode>('email');
  const [emailInput, setEmailInput] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StatusCheckResponse | null>(null);
  const [needsOtp, setNeedsOtp] = useState(false);
  const [otpMethod, setOtpMethod] = useState<VerificationMethod>('email');
  const [error, setError] = useState<string | null>(null);

  const buildContact = (): { email?: string; phone?: string } => {
    if (contactMode === 'email') {
      return { email: emailInput.trim() };
    }
    if (!isValidIndiaPhoneDigits(phoneDigits)) {
      throw new Error(INDIA_PHONE_ERROR);
    }
    return { phone: formatIndiaPhone(phoneDigits) };
  };

  const contactLabel =
    contactMode === 'email' ? emailInput.trim() : formatIndiaPhone(phoneDigits);

  const handleCheck = async () => {
    if (!trackingId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const contact = buildContact();
      const res = await onCheck(trackingId.trim(), contact);
      setResult(res);
      setNeedsOtp(res.verification_required);
      setOtpMethod(res.verification_method ?? (contact.email ? 'email' : 'sms'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Status check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const contact = buildContact();
      await onVerify(trackingId.trim(), contact, otp);
      const res = await onCheck(trackingId.trim(), contact);
      setResult(res);
      setNeedsOtp(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const canCheck =
    trackingId.trim().length > 0 &&
    (contactMode === 'email' ? emailInput.trim().length > 0 : isValidIndiaPhoneDigits(phoneDigits));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[var(--surface-card)] rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-[var(--border-default)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
          <h2 className="font-semibold">Check request status</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {needsOtp && result ? (
            <OtpVerification
              verificationMethod={otpMethod}
              contact={contactLabel}
              trackingId={trackingId}
              onVerify={handleVerify}
              onResend={() => onResend(trackingId.trim(), buildContact())}
              onBack={() => setNeedsOtp(false)}
              loading={loading}
            />
          ) : result && !result.verification_required ? (
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-[var(--text-secondary)]">Request ID: </span>
                <span className="font-mono font-medium">{result.tracking_id}</span>
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Right: </span>
                {RIGHT_TYPE_LABELS[result.right_type]}
              </div>
              <div>
                <span className="text-[var(--text-secondary)]">Status: </span>
                {STATUS_LABELS[result.status]}
              </div>
              {result.days_remaining !== null && (
                <div>
                  <span className="text-[var(--text-secondary)]">Days remaining: </span>
                  {result.days_remaining}
                </div>
              )}
              {result.breached && (
                <p className="text-red-600 font-medium">This request is past its SLA deadline.</p>
              )}
              <p className="text-[var(--text-secondary)]">{result.message}</p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-2">Request ID</label>
                <input
                  type="text"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="REQ-2026-XXXXXX"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Contact used for this request</label>
                <div className="flex gap-4 mb-3 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status-contact-mode"
                      checked={contactMode === 'email'}
                      onChange={() => setContactMode('email')}
                    />
                    Email
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status-contact-mode"
                      checked={contactMode === 'phone'}
                      onChange={() => setContactMode('phone')}
                    />
                    Phone
                  </label>
                </div>
                {contactMode === 'email' ? (
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="your.email@example.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                ) : (
                  <IndiaPhoneInput
                    value={phoneDigits}
                    onChange={setPhoneDigits}
                    className="w-full"
                    inputClassName="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-r-md"
                  />
                )}
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="button"
                disabled={loading || !canCheck}
                onClick={() => void handleCheck()}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Checking…' : 'Check status'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
