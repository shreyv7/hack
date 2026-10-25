import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import {
  CheckCircle2,
  Shield,
  Mail,
  Smartphone,
  FileText,
  User,
  Sparkles,
} from 'lucide-react';
import { OtpVerification } from '@/app/components/portal/OtpVerification';
import { notify } from '@/app/utils/notify';
import {
  fetchConsentCampaignPage,
  resendConsentCampaignOtp,
  submitConsentCampaignDecision,
  verifyConsentCampaignOtp,
  type ConsentCampaignPage,
  type ConsentCampaignPurpose,
} from '@/lib/api/emailCampaign';
import { cn } from '@/lib/utils';

type Screen = 'loading' | 'notice' | 'customize' | 'otp' | 'confirmation' | 'already_responded' | 'error';

function buildPurposesState(
  purposes: ConsentCampaignPurpose[],
  mode: 'accept' | 'reject' | 'customize',
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const p of purposes) {
    if (p.is_required) {
      out[p.id] = true;
      continue;
    }
    if (mode === 'accept') out[p.id] = true;
    else if (mode === 'reject') out[p.id] = false;
    else out[p.id] = p.default_consented;
  }
  return out;
}

export function EmailConsentCampaignPublic(): ReactElement {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const lang = searchParams.get('lang') || 'en';

  const [screen, setScreen] = useState<Screen>('loading');
  const [page, setPage] = useState<ConsentCampaignPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purposes, setPurposes] = useState<Record<string, boolean>>({});
  const [decisionType, setDecisionType] = useState<'accept' | 'reject' | 'customize'>('accept');

  // Verification & Basic info state
  const [otpChannel, setOtpChannel] = useState<'email' | 'sms'>('email');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');

  const [confirmation, setConfirmation] = useState<{
    receipt_id: string;
    consented_purposes: Record<string, boolean>;
    portal_url: string | null;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchConsentCampaignPage(token, lang);
        if (cancelled) return;
        setPage(data);
        if (data.recipient_email) setRecipientEmail(data.recipient_email);
        if (data.recipient_phone) setRecipientPhone(data.recipient_phone);

        if (data.already_responded) {
          setScreen('already_responded');
        } else {
          setPurposes(buildPurposesState(data.purposes, 'accept'));
          setScreen('notice');
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load consent notice form');
          setScreen('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, lang]);

  const optionalPurposes = useMemo(
    () => (page?.purposes ?? []).filter((p) => !p.is_required),
    [page],
  );
  const requiredPurposes = useMemo(
    () => (page?.purposes ?? []).filter((p) => p.is_required),
    [page],
  );

  const proceedToOtp = useCallback(
    async (mode: 'accept' | 'reject' | 'customize', nextPurposes: Record<string, boolean>) => {
      setSubmitting(true);
      try {
        await submitConsentCampaignDecision(token, {
          decision_type: mode,
          consented_purposes: nextPurposes,
          language: lang,
          otp_channel: otpChannel,
          recipient_email: recipientEmail || undefined,
          recipient_phone: recipientPhone || undefined,
        });
        setDecisionType(mode);
        setPurposes(nextPurposes);
        setScreen('otp');
      } catch (e) {
        notify(e instanceof Error ? e.message : 'Could not submit decision');
      } finally {
        setSubmitting(false);
      }
    },
    [token, lang, otpChannel, recipientEmail, recipientPhone],
  );

  const handleAccept = () => {
    const next = buildPurposesState(page?.purposes ?? [], 'accept');
    void proceedToOtp('accept', next);
  };

  const handleReject = () => {
    const next = buildPurposesState(page?.purposes ?? [], 'reject');
    void proceedToOtp('reject', next);
  };

  const handleCustomizeConfirm = () => {
    void proceedToOtp('customize', purposes);
  };

  const handleVerifyOtp = async (otp: string) => {
    setSubmitting(true);
    try {
      const result = await verifyConsentCampaignOtp(token, otp);
      setConfirmation({
        receipt_id: result.receipt_id,
        consented_purposes: result.consented_purposes,
        portal_url: result.portal_url,
      });
      setScreen('confirmation');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Invalid verification code');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      await resendConsentCampaignOtp(token);
      notify('Verification code resent');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not resend code');
    }
  };

  if (screen === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)]">
        <div className="text-center space-y-3">
          <Shield className="w-10 h-10 text-[var(--brand-primary)] animate-pulse mx-auto" />
          <p className="text-sm font-medium text-[var(--text-secondary)]">Loading DPDPA Privacy Notice…</p>
        </div>
      </div>
    );
  }

  if (screen === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] px-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-xl">
          <p className="text-[var(--status-danger)] font-bold text-lg mb-2">Notice Unavailable</p>
          <p className="text-sm text-[var(--text-secondary)]">{error}</p>
        </div>
      </div>
    );
  }

  if (screen === 'already_responded' && page) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface-base)] px-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-8 text-center shadow-xl space-y-4">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Consent Decision Already Recorded</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Your consent decision (<span className="font-semibold capitalize text-[var(--brand-primary)]">{page.consent_decision}</span>) was cryptographically sealed in the Proof Vault for {page.organization_name}.
          </p>
          {page.portal_url && (
            <a href={page.portal_url} className="inline-block px-5 py-2.5 rounded-xl bg-[var(--brand-primary)] text-white text-sm font-bold shadow-md">
              Manage Your Data Rights Portal
            </a>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'confirmation' && page && confirmation) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] px-4 py-12 flex items-center justify-center">
        <div className="max-w-lg w-full rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-8 shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Consent Recorded & Sealed</h1>
            <p className="text-xs text-[var(--text-secondary)]">
              DPDPA §6(10) Evidence Proof Vault Reference:{' '}
              <code className="bg-[var(--surface-raised)] px-2 py-0.5 rounded font-mono text-[var(--brand-primary)]">{confirmation.receipt_id.slice(0, 10)}…</code>
            </p>
          </div>

          <div className="rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] p-4 space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Recorded Preferences</h3>
            {(page.purposes ?? []).map((p) => (
              <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-[var(--border-default)] last:border-0">
                <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-bold', confirmation.consented_purposes[p.id] ? 'bg-emerald-500/10 text-emerald-600' : 'bg-slate-500/10 text-slate-600')}>
                  {confirmation.consented_purposes[p.id] ? 'Consented' : 'Withheld'}
                </span>
              </div>
            ))}
          </div>

          {confirmation.portal_url && (
            <a
              href={confirmation.portal_url}
              className="block w-full text-center py-3 rounded-xl bg-[var(--brand-primary)] text-white font-bold text-sm shadow-lg"
            >
              Access Data Rights Portal
            </a>
          )}
        </div>
      </div>
    );
  }

  if (screen === 'otp' && page) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] px-4 py-12 flex items-center justify-center">
        <div className="max-w-md w-full">
          <OtpVerification
            verificationMethod={otpChannel}
            contact={otpChannel === 'sms' ? (page.masked_phone || recipientPhone || 'your mobile') : (page.masked_email || recipientEmail || 'your email')}
            trackingId="consent-campaign"
            referenceLabel="DPDPA Consent Verification"
            onVerify={handleVerifyOtp}
            onResend={handleResendOtp}
            onBack={() => setScreen(decisionType === 'customize' ? 'customize' : 'notice')}
            loading={submitting}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] text-[var(--text-primary)] pb-32">
      {/* Header Emblem */}
      <header className="border-b border-[var(--border-default)] bg-[var(--surface-card)] px-6 py-5 sticky top-0 z-30 shadow-sm">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] rounded-xl">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase tracking-wider">{page?.organization_name}</p>
              <h1 className="text-lg font-bold text-[var(--text-primary)]">Statutory Privacy Notice</h1>
            </div>
          </div>

          <span className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" /> DPDPA Act 2023 Compliant
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Full DPDPA Document Header Box */}
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] overflow-hidden shadow-sm">
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--text-primary)]">{page?.notice.title || 'Data Protection & Privacy Notice'}</h2>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Under Section 6(1) of the Digital Personal Data Protection Act, 2023</p>
              </div>
              <FileText className="w-6 h-6 text-[var(--brand-primary)] opacity-80 shrink-0" />
            </div>

            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {page?.notice.description || 'This statutory notice informs you about the categories of personal data collected, processing purposes, your statutory rights as a Data Principal, and contact details of our Data Protection Officer.'}
            </p>

            {/* DPO & Retention info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {page?.notice.dpo_name && (
                <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] text-xs space-y-1">
                  <span className="font-bold text-[var(--text-tertiary)] uppercase">Data Protection Officer (DPO)</span>
                  <p className="font-semibold text-[var(--text-primary)]">{page.notice.dpo_name}</p>
                  {page.notice.dpo_email && <p className="text-[var(--text-secondary)]">{page.notice.dpo_email}</p>}
                </div>
              )}

              {page?.notice.retention_policy && (
                <div className="p-3 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] text-xs space-y-1">
                  <span className="font-bold text-[var(--text-tertiary)] uppercase">Data Retention Policy</span>
                  <p className="text-[var(--text-secondary)]">{page.notice.retention_policy}</p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Data Principal Verification Options (Email / SMS) */}
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[var(--brand-primary)]" />
            <h3 className="font-bold text-base text-[var(--text-primary)]">Data Principal Verification Details</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Email Address
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="name@domain.com"
                className="mt-1.5 w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm font-medium"
              />
            </label>

            <label className="block text-xs font-semibold text-[var(--text-secondary)]">
              Mobile Phone Number
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="mt-1.5 w-full border border-[var(--border-default)] rounded-xl px-3.5 py-2.5 bg-[var(--surface-base)] text-sm font-medium"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Select OTP Verification Channel</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setOtpChannel('email')}
                className={cn(
                  'p-3.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all',
                  otpChannel === 'email'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shadow-sm'
                    : 'border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)]',
                )}
              >
                <Mail className="w-4 h-4" /> Verify via Email OTP
              </button>

              <button
                type="button"
                onClick={() => setOtpChannel('sms')}
                className={cn(
                  'p-3.5 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all',
                  otpChannel === 'sms'
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] shadow-sm'
                    : 'border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-secondary)]',
                )}
              >
                <Smartphone className="w-4 h-4" /> Verify via SMS OTP
              </button>
            </div>
          </div>
        </section>

        {/* Processing Purposes List */}
        {screen === 'customize' ? (
          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-base text-[var(--text-primary)]">Customize Granular Optional Purposes</h3>
            {requiredPurposes.map((p) => (
              <div key={p.id} className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[var(--text-primary)]">{p.name}</span>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-500/10 text-slate-600">Essential / Required</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{p.description}</p>
              </div>
            ))}
            {optionalPurposes.map((p) => (
              <label key={p.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-base)] cursor-pointer hover:border-[var(--brand-primary)] transition-all">
                <input
                  type="checkbox"
                  checked={Boolean(purposes[p.id])}
                  onChange={(e) => setPurposes((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                  className="mt-1 w-4 h-4 rounded text-[var(--brand-primary)]"
                />
                <div>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{p.name}</p>
                  <p className="text-xs text-[var(--text-secondary)]">{p.description}</p>
                </div>
              </label>
            ))}
            <button
              type="button"
              disabled={submitting}
              onClick={handleCustomizeConfirm}
              className="w-full py-3 rounded-xl bg-[var(--brand-primary)] text-white font-bold text-sm shadow-lg disabled:opacity-50"
            >
              Continue to OTP Verification
            </button>
          </section>
        ) : (
          <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-6 shadow-sm space-y-3">
            <h3 className="font-bold text-base text-[var(--text-primary)]">Data Processing Purposes</h3>
            {(page?.purposes ?? []).map((p) => (
              <div key={p.id} className="p-3.5 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-default)] text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-[var(--text-primary)]">{p.name}</span>
                  <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded', p.is_required ? 'bg-slate-500/10 text-slate-600' : 'bg-indigo-500/10 text-indigo-600')}>
                    {p.is_required ? 'Essential' : 'Optional'}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)]">{p.description}</p>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* Floating Action Sticky Bar */}
      {screen === 'notice' && (
        <div className="fixed bottom-0 inset-x-0 border-t border-[var(--border-default)] bg-[var(--surface-card)]/90 backdrop-blur-md px-4 py-4 z-40">
          <div className="max-w-3xl mx-auto flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={submitting}
              onClick={handleAccept}
              className="flex-1 py-3.5 rounded-xl bg-[var(--brand-primary)] hover:opacity-90 text-white font-bold text-sm shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" /> Accept All & Verify OTP
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setPurposes(buildPurposesState(page?.purposes ?? [], 'customize'));
                setScreen('customize');
              }}
              className="flex-1 py-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-raised)] hover:bg-black/5 dark:hover:bg-white/5 text-[var(--text-primary)] font-bold text-sm transition-all"
            >
              Customize Optional
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleReject}
              className="py-3.5 px-5 rounded-xl border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold text-sm transition-all"
            >
              Reject Optional
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
