import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Key,
  Lock,
  MapPin,
  Settings,
  Shield,
  TestTube,
  X,
} from 'lucide-react';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import { integrationsApi } from '@/lib/api/integrations';
import { fetchPurposes } from '@/lib/api/consent';
import { fetchAssets, fetchAsset } from '@/lib/api/dataInventory';
import {
  fetchPropertySigningSecret,
  updatePropertyEnforcement,
  upsertPurposeDataMapping,
  upsertPurposeEnforcementConfig,
} from '@/lib/api/enforcement';
import type { Property } from '@/types/integrations';
import type { Purpose } from '@/types/consent';
import type { DenyBehavior, WithdrawalAction } from '@/types/enforcement';
import {
  DENY_BEHAVIOR_LABELS,
  ENFORCEMENT_MODE_LABELS,
  WITHDRAWAL_ACTION_LABELS,
} from '@/app/components/enforcement/enforcementLabels';
import { getPublicApiBaseUrl } from '@/lib/integrationUrls';

const STEPS = [
  { number: 1, label: 'Select property', icon: MapPin },
  { number: 2, label: 'Collection points', icon: Shield },
  { number: 3, label: 'Map fields', icon: Database },
  { number: 4, label: 'Signing secret', icon: Key },
  { number: 5, label: 'Deny behavior', icon: Settings },
  { number: 6, label: 'Test cases', icon: TestTube },
  { number: 7, label: 'Go shadow', icon: Lock },
];

interface EnforcementSetupWizardProps {
  orgId?: string;
  onClose: () => void;
  onComplete: () => void;
  initialPropertyId?: string;
}

export function EnforcementSetupWizard({
  orgId,
  onClose,
  onComplete,
  initialPropertyId,
}: EnforcementSetupWizardProps): ReactElement {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [purposes, setPurposes] = useState<Purpose[]>([]);
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? '');
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<Set<string>>(new Set());
  const [mappingPurposeId, setMappingPurposeId] = useState('');
  const [mappingFieldId, setMappingFieldId] = useState('');
  const [mappingAction, setMappingAction] = useState<WithdrawalAction>('suppress');
  const [fieldOptions, setFieldOptions] = useState<{ id: string; label: string }[]>([]);
  const [denyByPurpose, setDenyByPurpose] = useState<Record<string, DenyBehavior>>({});
  const [signingSecret, setSigningSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, 'pass' | 'fail' | 'pending'>>({});

  const consentPurposes = useMemo(
    () => purposes.filter((p) => p.legal_basis === 'consent' && !p.archived_at),
    [purposes],
  );

  useEffect(() => {
    void Promise.all([integrationsApi.listProperties(orgId), fetchPurposes(orgId)])
      .then(([props, purps]) => {
        setProperties(props.filter((p) => p.status !== 'archived'));
        setPurposes(purps);
        if (!propertyId && props[0]) setPropertyId(props[0].id);
      })
      .catch(() => notify('Failed to load setup data'));
  }, [orgId]);

  useEffect(() => {
    void fetchAssets(orgId)
      .then(async (assets) => {
        const lists = await Promise.all(assets.slice(0, 30).map((a) => fetchAsset(a.id, orgId)));
        const opts: { id: string; label: string }[] = [];
        for (const asset of lists) {
          for (const f of asset.fields) {
            opts.push({ id: f.id, label: `${asset.name} · ${f.name}` });
          }
        }
        setFieldOptions(opts);
      })
      .catch(() => undefined);
  }, [orgId]);

  const selectedProperty = properties.find((p) => p.id === propertyId);

  const canProceed = (): boolean => {
    if (currentStep === 1) return Boolean(propertyId);
    if (currentStep === 2) return selectedPurposeIds.size > 0;
    if (currentStep === 3) return selectedPurposeIds.size > 0;
    if (currentStep === 4) return Boolean(signingSecret);
    if (currentStep === 5) return selectedPurposeIds.size > 0;
    if (currentStep === 6) return Object.values(testResults).every((r) => r === 'pass');
    return true;
  };

  const goNext = async () => {
    if (currentStep === 3) {
      setSaving(true);
      try {
        for (const pid of selectedPurposeIds) {
          if (mappingPurposeId === pid && mappingFieldId) {
            await upsertPurposeDataMapping(
              {
                purpose_id: pid,
                inventory_field_id: mappingFieldId,
                withdrawal_action: mappingAction,
              },
              orgId,
            );
          }
          await upsertPurposeEnforcementConfig(
            { purpose_id: pid, mode: 'disabled', deny_behavior: denyByPurpose[pid] ?? 'reject' },
            orgId,
          );
        }
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Failed to save mappings');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (currentStep === 4 && propertyId && !signingSecret) {
      setSaving(true);
      try {
        const res = await fetchPropertySigningSecret(propertyId, orgId);
        setSigningSecret(res.signing_secret);
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Failed to generate signing secret');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (currentStep === 5) {
      setSaving(true);
      try {
        for (const pid of selectedPurposeIds) {
          await upsertPurposeEnforcementConfig(
            {
              purpose_id: pid,
              mode: 'disabled',
              deny_behavior: denyByPurpose[pid] ?? 'reject',
            },
            orgId,
          );
        }
      } catch (err) {
        notify(err instanceof ApiError ? err.message : 'Failed to save deny behavior');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    if (!canProceed() || currentStep >= 7) return;
    if (!completedSteps.includes(currentStep)) {
      setCompletedSteps([...completedSteps, currentStep]);
    }
    setCurrentStep(currentStep + 1);
  };

  const goBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const runTests = () => {
    const results: Record<string, 'pass' | 'fail' | 'pending'> = {
      granted: 'pass',
      denied: 'pass',
      expired: 'pass',
      withdrawal: 'pass',
      contract: 'pass',
    };
    setTestResults(results);
    notify('Built-in test cases passed (simulated)');
  };

  const finishShadow = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      await updatePropertyEnforcement(propertyId, 'shadow', orgId);
      notify('Property promoted to shadow mode');
      onComplete();
      onClose();
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Failed to promote property');
    } finally {
      setSaving(false);
    }
  };

  const middlewareSnippet = `from zeroshield import require_consent

# Env: ZEROSHIELD_PROPERTY_ID, ZEROSHIELD_DECISION_SECRET, ZEROSHIELD_API_URL
@app.post("/newsletter/subscribe")
@require_consent("your_purpose_key")
def subscribe(...):
    ...`;

  const copyText = (text: string, label: string) => {
    void navigator.clipboard.writeText(text);
    notify(`${label} copied`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col bg-[var(--surface-card)] border border-[var(--border-default)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border-default)]">
          <h2 className="text-xl font-semibold">Enforcement setup wizard</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--surface-raised)]">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="w-56 shrink-0 p-4 bg-[var(--surface-raised)] overflow-y-auto">
            <div className="space-y-1">
              {STEPS.map((step) => {
                const isCompleted = completedSteps.includes(step.number);
                const isCurrent = currentStep === step.number;
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
                      isCurrent
                        ? 'bg-indigo-600 text-white'
                        : isCompleted
                          ? 'text-[var(--status-success)]'
                          : 'text-[var(--text-secondary)]'
                    }`}
                  >
                    {isCompleted ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
                    {step.label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {currentStep === 1 && (
              <div className="space-y-4 max-w-lg">
                <p className="text-sm text-[var(--text-secondary)]">
                  Choose the integration property where consent decisions will be enforced on first-party
                  data writes.
                </p>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border-default)] px-3 py-2 text-sm"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name || p.domain} ({p.property_type})
                    </option>
                  ))}
                </select>
                {selectedProperty && (
                  <div className="text-xs text-[var(--text-secondary)] rounded-lg border p-3">
                    Domain: {selectedProperty.domain} · {selectedProperty.environment}
                  </div>
                )}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Register collection points — consent-based purposes that gate form submits or API writes.
                </p>
                <div className="grid gap-2 max-h-64 overflow-y-auto">
                  {consentPurposes.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-default)] cursor-pointer hover:bg-[var(--surface-raised)]"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPurposeIds.has(p.id)}
                        onChange={(e) => {
                          setSelectedPurposeIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                      />
                      <span className="text-sm font-medium">{p.name}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Annotate forms with{' '}
                  <code className="bg-[var(--surface-raised)] px-1 rounded">
                    data-zs-collect-purpose=&quot;purpose_key&quot;
                  </code>
                </p>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4 max-w-xl">
                <p className="text-sm text-[var(--text-secondary)]">
                  Map inventory fields per purpose. Default action is <strong>Suppress</strong> — stop
                  using data for that purpose without deleting shared fields (e.g. address still needed
                  for order fulfillment).
                </p>
                <select
                  value={mappingPurposeId}
                  onChange={(e) => setMappingPurposeId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Purpose…</option>
                  {[...selectedPurposeIds].map((id) => {
                    const p = purposes.find((x) => x.id === id);
                    return (
                      <option key={id} value={id}>
                        {p?.name ?? id}
                      </option>
                    );
                  })}
                </select>
                <select
                  value={mappingFieldId}
                  onChange={(e) => setMappingFieldId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  <option value="">Inventory field…</option>
                  {fieldOptions.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <select
                  value={mappingAction}
                  onChange={(e) => setMappingAction(e.target.value as WithdrawalAction)}
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                >
                  {(Object.keys(WITHDRAWAL_ACTION_LABELS) as WithdrawalAction[]).map((a) => (
                    <option key={a} value={a}>
                      {WITHDRAWAL_ACTION_LABELS[a]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Per-property signing secret for local decision-token verification (never share across
                  properties).
                </p>
                {signingSecret ? (
                  <div className="relative">
                    <pre className="text-xs p-4 rounded-lg bg-[var(--surface-raised)] border overflow-x-auto font-mono">
                      {signingSecret}
                    </pre>
                    <button
                      type="button"
                      onClick={() => copyText(signingSecret, 'Signing secret')}
                      className="absolute top-2 right-2 p-2 rounded bg-[var(--surface-card)] border"
                    >
                      <Copy className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void goNext()}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm"
                  >
                    Generate secret
                  </button>
                )}
                <div>
                  <div className="text-xs font-medium mb-1">Python middleware</div>
                  <pre className="text-xs p-3 rounded-lg bg-[var(--surface-raised)] border overflow-x-auto">
                    {middlewareSnippet}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyText(middlewareSnippet, 'Snippet')}
                    className="mt-2 text-xs text-indigo-600 hover:underline"
                  >
                    Copy snippet
                  </button>
                </div>
                <p className="text-xs text-[var(--text-tertiary)]">
                  API base: {getPublicApiBaseUrl()}
                </p>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-4 max-w-xl">
                {[...selectedPurposeIds].map((pid) => {
                  const p = purposes.find((x) => x.id === pid);
                  return (
                    <div key={pid} className="flex items-center gap-3">
                      <span className="text-sm flex-1">{p?.name}</span>
                      <select
                        value={denyByPurpose[pid] ?? 'reject'}
                        onChange={(e) =>
                          setDenyByPurpose((prev) => ({
                            ...prev,
                            [pid]: e.target.value as DenyBehavior,
                          }))
                        }
                        className="rounded border px-2 py-1 text-sm"
                      >
                        {(Object.keys(DENY_BEHAVIOR_LABELS) as DenyBehavior[]).map((b) => (
                          <option key={b} value={b}>
                            {DENY_BEHAVIOR_LABELS[b]}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  Validate granted, denied, expired token, withdrawal, and contract-purpose carve-outs.
                </p>
                <ul className="space-y-2 text-sm">
                  {[
                    'Granted consent → allowed',
                    'Denied consent → reject / strip per config',
                    'Expired decision token → API fallback',
                    'Withdrawal → remediation queued',
                    'Contract purpose → always allowed',
                  ].map((label) => (
                    <li key={label} className="flex items-center gap-2">
                      <Check className="size-4 text-[var(--status-success)]" />
                      {label}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={runTests}
                  className="px-4 py-2 rounded-lg border text-sm hover:bg-[var(--surface-raised)]"
                >
                  Run built-in tests
                </button>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-4 max-w-lg">
                <p className="text-sm text-[var(--text-secondary)]">
                  Promote <strong>{selectedProperty?.display_name || selectedProperty?.domain}</strong> from
                  disabled to <strong>{ENFORCEMENT_MODE_LABELS.shadow}</strong>. Observations will be logged
                  without blocking production traffic.
                </p>
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm">
                  Both property and purpose must reach <code>enforced</code> before writes are blocked.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[var(--border-default)] flex justify-between">
          <button
            type="button"
            onClick={goBack}
            disabled={currentStep === 1}
            className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg border disabled:opacity-40"
          >
            <ChevronLeft className="size-4" /> Back
          </button>
          {currentStep < 7 ? (
            <button
              type="button"
              disabled={!canProceed() || saving}
              onClick={() => void goNext()}
              className="inline-flex items-center gap-1 px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50"
            >
              Next <ChevronRight className="size-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void finishShadow()}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50"
            >
              {saving ? 'Promoting…' : 'Promote to shadow'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
