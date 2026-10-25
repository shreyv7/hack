import type { ReactElement } from 'react';
import { useState } from 'react';
import type { VerificationMethod } from '@/types/dsar';
import { Button } from '@/app/components/ui/Button';

interface OtpVerificationProps {
  verificationMethod: VerificationMethod;
  contact: string;
  trackingId: string;
  referenceLabel?: string;
  onVerify: (otp: string) => Promise<void>;
  onResend: () => Promise<void>;
  onBack: () => void;
  loading?: boolean;
}

export function OtpVerification({
  verificationMethod,
  contact,
  trackingId,
  referenceLabel = 'request',
  onVerify,
  onResend,
  onBack,
  loading = false,
}: OtpVerificationProps): ReactElement {
  const [otp, setOtp] = useState('');
  const channelLabel = verificationMethod === 'sms' ? 'phone' : 'email';

  return (
    <div className="max-w-md mx-auto px-8">
      <div className="p-8 rounded-xl bg-[var(--surface-card)] border border-[var(--border-default)]">
        <h2 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          Verify your {channelLabel}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          We sent a 6-digit code to <strong>{contact}</strong> for {referenceLabel}{' '}
          <span className="font-mono">{trackingId}</span>.
        </p>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="000000"
          className="w-full px-4 py-3 text-center text-2xl font-mono tracking-widest border border-[var(--border-default)] rounded-lg mb-4"
        />
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            disabled={otp.length < 6 || loading}
            onClick={() => void onVerify(otp)}
          >
            {loading ? 'Verifying…' : 'Verify code'}
          </Button>
          <Button variant="secondary" size="md" disabled={loading} onClick={() => void onResend()}>
            Resend code
          </Button>
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-[var(--brand-primary)] hover:underline mt-2"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
