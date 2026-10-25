import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { OtpVerification } from '@/app/components/portal/OtpVerification';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import { fetchBankingConfig } from '@/lib/api/consentBanking';
import {
  completeAssistedSession,
  createAssistedSession,
  resendAssistedOtp,
  verifyAssistedOtp,
} from '@/lib/api/consentCaptureSessions';
import { integrationsApi } from '@/lib/api/integrations';
import type { JourneyConfig } from '@/types/consentBanking';
import type { ConsentCaptureSessionRead } from '@/types/consentCaptureSession';
import type { Property } from '@/types/integrations';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';

const DEFAULT_PURPOSES = ['necessary', 'marketing', 'analytics'] as const;

type Step = 'setup' | 'customer' | 'staff' | 'consent' | 'otp' | 'done';

interface AssistedConsentCaptureProps {
  journeyKey: 'branch_assisted' | 'merchant';
  title: string;
}

export function AssistedConsentCapture({ journeyKey, title }: AssistedConsentCaptureProps): ReactElement {
  const org = useComplianceOrg();
  const [step, setStep] = useState<Step>('setup');
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [journey, setJourney] = useState<JourneyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const [bankCustomerRef, setBankCustomerRef] = useState('');
  const [mobile, setMobile] = useState('');
  const [accountRef, setAccountRef] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [staffId, setStaffId] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [language, setLanguage] = useState('en');
  const [purposes, setPurposes] = useState<Record<string, boolean>>({
    necessary: true,
    marketing: false,
    analytics: false,
  });

  const [session, setSession] = useState<ConsentCaptureSessionRead | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!org.hasOrg) return;
    let active = true;
    setLoading(true);
    Promise.all([
      integrationsApi.listProperties(org.orgIdParam),
      fetchBankingConfig(org.orgIdParam),
    ])
      .then(([props, cfg]) => {
        if (!active) return;
        setProperties(props);
        const j = cfg.journeys.find((x) => x.key === journeyKey) ?? null;
        setJourney(j);
        if (props.length === 1) setPropertyId(props[0].id);
      })
      .catch((e) => notify(e instanceof ApiError ? e.message : 'Failed to load config'))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org.hasOrg, org.orgIdParam, journeyKey]);

  const staffRequired = journey?.staff_metadata_required ?? false;
  const otpRequired = journey?.otp_required ?? false;

  const identifiers = useMemo(() => {
    const ids: Array<{ type: string; token: string }> = [];
    if (accountRef.trim()) ids.push({ type: 'account_ref', token: accountRef.trim() });
    return ids;
  }, [accountRef]);

  const buildSessionPayload = () => {
    const clientSessionId = crypto.randomUUID();
    const sessionId = `assist-${Date.now()}`;
    return {
      client_session_id: clientSessionId,
      journey_key: journeyKey,
      capture_channel: journey?.channel,
      capture_mode: 'online' as const,
      session_id: sessionId,
      consented_purposes: purposes,
      language,
      bank_customer_ref: bankCustomerRef.trim() || undefined,
      principal_phone: mobile.trim() || undefined,
      identifiers,
      staff_metadata:
        journeyKey === 'merchant'
          ? { merchant_id: merchantId.trim() || undefined, staff_id: staffId.trim() || undefined }
          : {
              branch_code: branchCode.trim() || undefined,
              staff_id: staffId.trim() || undefined,
            },
      auto_complete: !otpRequired,
    };
  };

  const submitConsent = async () => {
    if (!propertyId) {
      notify('Select an integration property');
      return;
    }
    setSubmitting(true);
    try {
      const result = await createAssistedSession(propertyId, buildSessionPayload(), org.orgIdParam);
      setSession(result);
      if (result.status === 'completed' || result.receipt_id) {
        setStep('done');
        notify('Consent captured successfully.');
      } else if (otpRequired) {
        setStep('otp');
      } else {
        const completed = await completeAssistedSession(propertyId, result.id, org.orgIdParam);
        setSession(completed);
        setStep('done');
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to capture consent');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (otp: string) => {
    if (!session || !propertyId) return;
    setSubmitting(true);
    try {
      const result = await verifyAssistedOtp(propertyId, session.id, otp, org.orgIdParam, true);
      setSession(result);
      setStep('done');
      notify('OTP verified. Consent recorded.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'OTP verification failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (!session || !propertyId) return;
    try {
      await resendAssistedOtp(propertyId, session.id, org.orgIdParam);
      notify('OTP resent.');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to resend OTP');
    }
  };

  return (
    <ConsentManagementGate
      title={title}
      loading={loading || org.loading}
      error={org.error}
      hasOrg={org.hasOrg}
      isSuperadmin={org.isSuperadmin}
      organizations={org.organizations}
      selectedOrgId={org.selectedOrgId}
      onSelectOrg={org.setSelectedOrgId}
    >
      <div className="p-8 max-w-[720px] mx-auto text-[var(--text-primary)]">
        <h1 className="mb-2">{title}</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Assisted consent capture with configurable OTP verification (Req 2).
        </p>

        {step === 'setup' && (
          <div className="space-y-4 border rounded-lg p-4 bg-[var(--surface-card)]">
            <label className="block text-sm">
              Integration property
              <select
                className="mt-1 w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)]"
                value={propertyId}
                onChange={(e) => setPropertyId(e.target.value)}
              >
                <option value="">Select property…</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name || p.domain}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!propertyId}
              className="px-4 py-2 rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
              onClick={() => setStep('customer')}
            >
              Continue
            </button>
          </div>
        )}

        {step === 'customer' && (
          <div className="space-y-4 border rounded-lg p-4 bg-[var(--surface-card)]">
            {journeyKey !== 'merchant' && (
              <label className="block text-sm">
                Bank customer ref (CIF token)
                <input
                  className="mt-1 w-full px-3 py-2 border rounded-md font-mono text-sm"
                  value={bankCustomerRef}
                  onChange={(e) => setBankCustomerRef(e.target.value)}
                  placeholder="cif_tok_opaque_abc"
                />
              </label>
            )}
            <label className="block text-sm">
              Mobile number
              <input
                className="mt-1 w-full px-3 py-2 border rounded-md"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="9876543210"
              />
            </label>
            {journeyKey === 'branch_assisted' && (
              <label className="block text-sm">
                Account reference (optional)
                <input
                  className="mt-1 w-full px-3 py-2 border rounded-md font-mono text-sm"
                  value={accountRef}
                  onChange={(e) => setAccountRef(e.target.value)}
                />
              </label>
            )}
            <div className="flex gap-2">
              <button type="button" className="px-3 py-2 border rounded-md text-sm" onClick={() => setStep('setup')}>
                Back
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-md bg-[var(--brand-primary)] text-white"
                onClick={() => setStep(staffRequired ? 'staff' : 'consent')}
              >
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'staff' && (
          <div className="space-y-4 border rounded-lg p-4 bg-[var(--surface-card)]">
            {journeyKey === 'merchant' ? (
              <label className="block text-sm">
                Merchant ID
                <input
                  className="mt-1 w-full px-3 py-2 border rounded-md"
                  value={merchantId}
                  onChange={(e) => setMerchantId(e.target.value)}
                />
              </label>
            ) : (
              <label className="block text-sm">
                Branch code
                <input
                  className="mt-1 w-full px-3 py-2 border rounded-md"
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                />
              </label>
            )}
            <label className="block text-sm">
              Staff ID
              <input
                className="mt-1 w-full px-3 py-2 border rounded-md"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <button type="button" className="px-3 py-2 border rounded-md text-sm" onClick={() => setStep('customer')}>
                Back
              </button>
              <button type="button" className="px-4 py-2 rounded-md bg-[var(--brand-primary)] text-white" onClick={() => setStep('consent')}>
                Next
              </button>
            </div>
          </div>
        )}

        {step === 'consent' && (
          <div className="space-y-4 border rounded-lg p-4 bg-[var(--surface-card)]">
            <label className="block text-sm">
              Language
              <select
                className="mt-1 w-full px-3 py-2 border rounded-md bg-[var(--surface-raised)]"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="mr">Marathi</option>
              </select>
            </label>
            <div className="space-y-2">
              <p className="text-sm font-medium">Consent purposes</p>
              {DEFAULT_PURPOSES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={purposes[p] ?? false}
                    disabled={p === 'necessary'}
                    onChange={(e) => setPurposes((prev) => ({ ...prev, [p]: e.target.checked }))}
                  />
                  {p === 'necessary' ? 'Strictly necessary' : p}
                </label>
              ))}
            </div>
            {otpRequired && (
              <p className="text-xs text-[var(--text-secondary)]">OTP will be sent to the customer mobile before proof is sealed.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-2 border rounded-md text-sm"
                onClick={() => setStep(staffRequired ? 'staff' : 'customer')}
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-50"
                onClick={() => void submitConsent()}
              >
                {submitting ? 'Submitting…' : otpRequired ? 'Send OTP & capture' : 'Record consent'}
              </button>
            </div>
          </div>
        )}

        {step === 'otp' && session && (
          <OtpVerification
            verificationMethod="sms"
            contact={session.masked_mobile ?? mobile}
            trackingId={session.client_session_id.slice(0, 8)}
            referenceLabel="session"
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            onBack={() => setStep('consent')}
            loading={submitting}
          />
        )}

        {step === 'done' && session && (
          <div className="border rounded-lg p-6 bg-[var(--surface-card)] space-y-3">
            <h2 className="font-semibold text-green-600">Consent recorded</h2>
            <p className="text-sm">
              Receipt ID: <code className="font-mono text-xs">{session.receipt_id ?? '—'}</code>
            </p>
            <p className="text-sm">
              Proof reference:{' '}
              <code className="font-mono text-xs">{session.proof_vault_record_id ?? '—'}</code>
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              Journey: {session.journey_key} · Channel: {session.capture_channel ?? '—'}
            </p>
            <button
              type="button"
              className="px-4 py-2 rounded-md border text-sm"
              onClick={() => {
                setStep('setup');
                setSession(null);
                setBankCustomerRef('');
                setMobile('');
              }}
            >
              Capture another
            </button>
          </div>
        )}
      </div>
    </ConsentManagementGate>
  );
}

export function BranchConsentCapture(): ReactElement {
  return <AssistedConsentCapture journeyKey="branch_assisted" title="Branch Consent Capture" />;
}

export function MerchantConsentCapture(): ReactElement {
  return <AssistedConsentCapture journeyKey="merchant" title="Merchant Consent Capture" />;
}
