import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { DPDPAChip } from '@/app/components/common/DPDPAChip';
import { PenaltyChip } from '@/app/components/common/PenaltyChip';
import { PortalLanding } from '@/app/components/portal/PortalLanding';
import { RequestForm } from '@/app/components/portal/RequestForm';
import { OtpVerification } from '@/app/components/portal/OtpVerification';
import { SubmissionConfirmation } from '@/app/components/portal/SubmissionConfirmation';
import { StatusCheck } from '@/app/components/portal/StatusCheck';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import {
  checkPortalStatus,
  fetchPortalBranding,
  resendPortalOtp,
  submitPortalRequest,
  updatePortalForm,
  verifyPortalOtp,
} from '@/lib/api/dsar';
import { listOrganizations } from '@/lib/api/admin';
import { fetchWorkspace } from '@/lib/api/workspace';
import { buildPublicPortalUrl, getPortalOrgSlugFromPath } from '@/lib/dsar/portalSlug';
import { useAuth } from '@/contexts/AuthContext';
import type { Organization } from '@/types/organization';
import type {
  DataRightType,
  PortalBranding,
  PortalFormSchema,
  VerificationMethod,
} from '@/types/dsar';

type Screen = 'landing' | 'form' | 'otp' | 'confirmation';

const PORTAL_ORG_STORAGE_KEYS = ['compliance_org_id', 'dsar_org_id', 'workspace_org_id', 'consent_org_id'] as const;
const PORTAL_PREVIEW_ORG_KEY = 'dsar_org_id';

function slugToDisplayName(slug: string): string {
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function readStoredOrgId(): string {
  try {
    for (const key of PORTAL_ORG_STORAGE_KEYS) {
      const value = sessionStorage.getItem(key);
      if (value) return value;
    }
  } catch {
    // ignore
  }
  return '';
}

function pickPreviewOrganization(orgs: Organization[]): Organization | null {
  const stored = readStoredOrgId();
  return orgs.find((o) => o.id === stored) ?? orgs[0] ?? null;
}

function storePreviewOrgId(orgId: string): void {
  try {
    if (orgId) sessionStorage.setItem(PORTAL_PREVIEW_ORG_KEY, orgId);
    else sessionStorage.removeItem(PORTAL_PREVIEW_ORG_KEY);
  } catch {
    // ignore
  }
}

function fallbackBranding(name: string, slug: string): PortalBranding {
  return {
    organization_name: name,
    organization_slug: slug,
    dpo_name: null,
    dpo_email: null,
    contact_email: null,
  };
}

const RIGHT_ID_MAP: Record<string, DataRightType> = {
  access: 'access',
  correct: 'correction',
  erase: 'erasure',
  nominate: 'nomination',
  grievance: 'grievance',
  withdraw: 'withdraw_consent',
};

interface DataRightsPortalPublicProps {
  orgSlug?: string | null;
}

export function DataRightsPortalPublic({
  orgSlug: orgSlugProp = null,
}: DataRightsPortalPublicProps): ReactElement {
  const { user } = useAuth();
  const pathSlug = orgSlugProp ?? getPortalOrgSlugFromPath();
  const isPublicPortal = Boolean(pathSlug);
  const isSuperadmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  const canCustomizeForms = Boolean(
    user && (isAdmin || user.role === 'user') && !isPublicPortal
  );
  const showOrgPicker = Boolean(isSuperadmin && user && !isPublicPortal);

  const [orgSlug, setOrgSlug] = useState(() => pathSlug ?? '');
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [resolvedOrgName, setResolvedOrgName] = useState(
    () => (pathSlug ? slugToDisplayName(pathSlug) : '')
  );
  const [screen, setScreen] = useState<Screen>('landing');
  const [branding, setBranding] = useState<PortalBranding | null>(null);
  const [selectedRight, setSelectedRight] = useState<DataRightType | null>(null);
  const [trackingId, setTrackingId] = useState('');
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [submitterPhone, setSubmitterPhone] = useState('');
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>('email');
  const [contactHint, setContactHint] = useState('');
  const [submittedAt, setSubmittedAt] = useState<Date | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [showStatusCheck, setShowStatusCheck] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const right = params.get('right');
    if (right === 'withdraw') {
      setSelectedRight('withdraw_consent');
      setScreen('form');
    }
  }, []);

  const applyOrganization = (org: Organization) => {
    setOrgSlug(org.slug);
    setResolvedOrgName(org.name);
    setBranding(fallbackBranding(org.name, org.slug));
    setSelectedOrgId(org.id);
    storePreviewOrgId(org.id);
  };

  useEffect(() => {
    if (isPublicPortal) return;
    if (!user) return;
    let cancelled = false;

    const resolveOrgSlug = async () => {
      try {
        if (user.role === 'superadmin') {
          const orgs = await listOrganizations();
          if (cancelled) return;
          setOrganizations(orgs);
          const org = pickPreviewOrganization(orgs);
          if (org?.slug) {
            applyOrganization(org);
          } else {
            setBootError('No organization available for portal preview');
          }
          return;
        }

        const ws = await fetchWorkspace();
        if (!cancelled && ws.organization.slug) {
          setOrgSlug(ws.organization.slug);
          setResolvedOrgName(ws.organization.name);
          setBranding(fallbackBranding(ws.organization.name, ws.organization.slug));
        }
      } catch {
        if (!cancelled) setBootError('Could not resolve organization for portal');
      }
    };

    void resolveOrgSlug();
    return () => {
      cancelled = true;
    };
  }, [user, isPublicPortal]);

  useEffect(() => {
    if (!orgSlug) return;
    let cancelled = false;
    void fetchPortalBranding(orgSlug)
      .then((b) => {
        if (!cancelled) {
          setBranding(b);
          setResolvedOrgName(b.organization_name);
        }
      })
      .catch(() => {
        // Branding is optional; keep fallback from org resolution when available.
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const handlePreviewOrgChange = (orgId: string) => {
    const org = organizations.find((o) => o.id === orgId);
    if (!org) return;
    applyOrganization(org);
    setScreen('landing');
    setSelectedRight(null);
    setShowStatusCheck(false);
  };

  const headerOrgName = branding?.organization_name ?? resolvedOrgName;
  const showPublicPortalUrl = Boolean(
    user && (isSuperadmin || isAdmin) && !isPublicPortal && orgSlug
  );
  const portalSlug = branding?.organization_slug ?? orgSlug;
  const publicPortalUrl = portalSlug ? buildPublicPortalUrl(portalSlug) : '';

  const copyPublicPortalUrl = async () => {
    if (!publicPortalUrl) return;
    try {
      await navigator.clipboard.writeText(publicPortalUrl);
      notify('Public portal link copied');
    } catch {
      notify('Could not copy link');
    }
  };

  const handleRightSelection = (rightId: string) => {
    const mapped = RIGHT_ID_MAP[rightId];
    if (!mapped) return;
    setSelectedRight(mapped);
    setScreen('form');
  };

  const handleSubmit = async (data: {
    requester_name: string;
    requester_email: string;
    requester_phone: string;
    request_details: string;
    extra_data: Record<string, unknown>;
    verification_method: VerificationMethod;
  }) => {
    if (!selectedRight) return;
    setLoading(true);
    try {
      const created = await submitPortalRequest(orgSlug, {
        right_type: selectedRight,
        requester_name: data.requester_name,
        requester_email: data.requester_email || null,
        requester_phone: data.requester_phone || null,
        request_details: data.request_details,
        extra_data: data.extra_data,
        verification_method: data.verification_method,
      });
      setTrackingId(created.tracking_id);
      setSubmitterName(data.requester_name);
      setSubmitterEmail(data.requester_email);
      setSubmitterPhone(data.requester_phone);
      setVerificationMethod(created.verification_method);
      setContactHint(created.contact_hint);
      setSubmittedAt(undefined);
      setScreen('otp');
      notify(created.message);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  const verificationContact = () => ({
    email: verificationMethod === 'email' ? submitterEmail : undefined,
    phone: verificationMethod === 'sms' ? submitterPhone : undefined,
  });

  const handleVerify = async (otp: string) => {
    setLoading(true);
    try {
      const res = await verifyPortalOtp(orgSlug, trackingId, otp, verificationContact());
      notify(res.message);
      setSubmittedAt(new Date());
      setScreen('confirmation');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePortalForm = async (schema: PortalFormSchema) => {
    try {
      await updatePortalForm(schema.right_type, {
        help_text: schema.help_text,
        fields: schema.fields,
      });
      notify('Portal form saved');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save form');
      throw e;
    }
  };

  const handleResend = async () => {
    try {
      const res = await resendPortalOtp(orgSlug, trackingId, verificationContact());
      notify(res.message);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Could not resend code');
    }
  };

  if (!orgSlug && !bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-[var(--text-secondary)]">Loading portal…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold mb-2">Portal unavailable</h1>
          <p className="text-[var(--text-secondary)]">{bootError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[var(--surface-base)]">
      <div className="bg-white dark:bg-[var(--surface-card)] border-b border-gray-200 dark:border-[var(--border-default)] py-4 px-6">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          {showOrgPicker ? (
            <select
              value={selectedOrgId}
              onChange={(e) => handlePreviewOrgChange(e.target.value)}
              className="font-semibold text-lg min-w-[180px] px-2 py-1 rounded-md border border-gray-200 dark:border-[var(--border-default)] bg-white dark:bg-[var(--surface-raised)] cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/30"
              aria-label="Preview organization"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="font-semibold text-lg">{headerOrgName}</div>
          )}
          <span className="text-xs text-gray-500 shrink-0">Privacy Portal</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto py-8 px-6">
        {showPublicPortalUrl && (
          <div className="mb-6 rounded-lg border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-800 px-4 py-3">
            <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100 mb-1">
              Public portal URL — {headerOrgName}
            </p>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-200/80 mb-2">
              This link is unique to {headerOrgName}. Every request submitted through it is routed to
              that organization only. Share with data principals; no login is required.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 text-xs sm:text-sm break-all rounded bg-white dark:bg-[var(--surface-card)] border border-indigo-200 dark:border-indigo-800 px-3 py-2 text-indigo-950 dark:text-indigo-50">
                {publicPortalUrl}
              </code>
              <button
                type="button"
                onClick={() => void copyPublicPortalUrl()}
                className="shrink-0 px-3 py-2 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Copy link
              </button>
            </div>
          </div>
        )}

        {screen === 'landing' && (
          <>
            {isPublicPortal && headerOrgName && (
              <p className="text-center text-sm text-[var(--text-secondary)] mb-6">
                You are submitting a request to <strong>{headerOrgName}</strong>. All requests on
                this page are handled by this organization only.
              </p>
            )}
            <div className="text-center mb-8">
              <div className="flex items-center justify-center gap-3 mb-2">
                <DPDPAChip
                  sections={[
                    { chapter: 3, section: 11, name: 'Right to access', url: '/dpdpa2023/chapter-3/section11.html' },
                    { chapter: 3, section: 12, name: 'Correction & erasure', url: '/dpdpa2023/chapter-3/section12.html' },
                    { chapter: 3, section: 13, name: 'Grievance', url: '/dpdpa2023/chapter-3/section13.html' },
                  ]}
                  size="detailed"
                />
                <PenaltyChip amount={50} />
              </div>
            </div>
            <PortalLanding
              onRightSelection={handleRightSelection}
              onStatusCheck={() => setShowStatusCheck(true)}
            />
            {branding?.dpo_email && (
              <p className="text-center text-sm text-gray-600 mt-8">
                DPO: {branding.dpo_name ?? 'Data Protection Officer'} · {branding.dpo_email}
              </p>
            )}
          </>
        )}

        {screen === 'form' && selectedRight && (
          <RequestForm
            orgSlug={orgSlug}
            rightType={selectedRight}
            onBack={() => setScreen('landing')}
            onSubmit={handleSubmit}
            loading={loading}
            canCustomize={canCustomizeForms}
            onSaveForm={canCustomizeForms ? handleSavePortalForm : undefined}
          />
        )}

        {screen === 'otp' && (
          <OtpVerification
            verificationMethod={verificationMethod}
            contact={
              contactHint ||
              (verificationMethod === 'sms' ? submitterPhone : submitterEmail)
            }
            trackingId={trackingId}
            onVerify={handleVerify}
            onResend={handleResend}
            onBack={() => setScreen('form')}
            loading={loading}
          />
        )}

        {screen === 'confirmation' && selectedRight && (
          <SubmissionConfirmation
            trackingId={trackingId}
            organizationName={headerOrgName}
            rightType={selectedRight}
            requesterName={submitterName}
            requesterEmail={submitterEmail}
            submittedAt={submittedAt}
            dpoEmail={branding?.dpo_email}
            dpoName={branding?.dpo_name}
            onDone={() => {
              setScreen('landing');
              setSelectedRight(null);
            }}
          />
        )}
      </div>

      {showStatusCheck && (
        <StatusCheck
          orgSlug={orgSlug}
          onClose={() => setShowStatusCheck(false)}
          onCheck={(tid, contact) => checkPortalStatus(orgSlug, tid, contact)}
          onVerify={(tid, contact, otp) =>
            verifyPortalOtp(orgSlug, tid, otp, contact).then(() => undefined)
          }
          onResend={(tid, contact) => resendPortalOtp(orgSlug, tid, contact).then(() => undefined)}
        />
      )}

      <div className="text-center text-xs text-gray-500 py-6">
        Powered by Vajra · DPDPA 2023 (India)
      </div>
    </div>
  );
}
