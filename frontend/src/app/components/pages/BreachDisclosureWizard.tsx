import { notify } from '@/app/utils/notify';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import { SectionReference } from '@/app/components/common/SectionReference';
import { useBreachWizard } from '@/hooks/useBreachWizard';
import { downloadBreachDisclosurePdf } from '@/lib/compliance/breachDisclosurePdf';
import { evaluateBreachWizardSteps } from '@/lib/compliance/breachWizardSteps';
import type { BreachWizardData } from '@/types/compliance';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import { Clock, AlertTriangle, Pencil, Check, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { noticeDeliveryApi, type DpNotificationAutoConfig, type NoticeDeliveryProvider } from '@/lib/api/noticeDelivery';

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m remaining`;
}

const SPECIAL_CATEGORY_OPTIONS = [
  'Children',
  'Health',
  'Financial',
  'Biometric',
  'Religious',
] as const;

const DATA_TYPE_OPTIONS = [
  'Name',
  'Email',
  'Phone',
  'Address',
  'Health records',
  'Prescriptions',
  'Payment info',
] as const;

function defaultDpEmailSubject(orgName: string): string {
  return `Important Security Notice from ${orgName || 'Your Organization'}`;
}

function defaultDpEmailBody(): string {
  return `Dear [First Name],

We are writing to inform you of a security incident that may have affected your personal information.

What happened:
On [Date], we discovered that personal data was inadvertently exposed due to a security incident.

What we're doing:
We have immediately secured the data, rotated credentials, and are conducting a full forensic investigation.`;
}

function severityBadgeClass(sev: string): string {
  switch (sev.toLowerCase()) {
    case 'critical':
      return 'bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-red-500/20';
    case 'high':
      return 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20';
    case 'medium':
      return 'bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-amber-500/20';
    case 'low':
      return 'bg-[var(--status-success-bg)] text-[var(--status-success)] border-green-500/20';
    default:
      return 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--border-default)]';
  }
}

const DP_CHANNEL_OPTIONS = [
  { id: 'email', label: 'Email', needsProvider: true },
  { id: 'sms', label: 'SMS', needsProvider: true },
  { id: 'in-app', label: 'In-app notification', needsProvider: false },
  { id: 'physical', label: 'Physical mail', needsProvider: true },
] as const;

const PUBLICATION_CHANNEL_OPTIONS = [
  'Company website',
  'Press release',
  'Social media',
  'News media',
] as const;

function configuredProvider(
  providers: NoticeDeliveryProvider[],
  channel: string,
): NoticeDeliveryProvider | undefined {
  return providers.find(
    (provider) =>
      provider.channel === channel && provider.is_active && provider.is_configured,
  );
}

/**
 * Step-by-step breach disclosure and notification wizard.
 */
export function BreachDisclosureWizard(): ReactElement {
  const navigate = useNavigate();
  const {
    incident,
    localDraft,
    isNewDraft,
    deadlineRemaining,
    loading,
    error,
    hasOrg,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    canEdit,
    orgName,
    orgIdParam,
    saveDraft,
    submitPackage,
  } = useBreachWizard();
  const [currentStep, setCurrentStep] = useState(1);
  const [wizardData, setWizardData] = useState<BreachWizardData>({});
  const [severity, setSeverity] = useState('high');
  const [providers, setProviders] = useState<NoticeDeliveryProvider[]>([]);
  const [dpAutoConfig, setDpAutoConfig] = useState<DpNotificationAutoConfig | null>(null);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [verifyingAffected, setVerifyingAffected] = useState(false);
  const [editingDpPreview, setEditingDpPreview] = useState(false);
  const [dpPreviewDraft, setDpPreviewDraft] = useState({ subject: '', body: '' });
  const [savingDpPreview, setSavingDpPreview] = useState(false);

  useEffect(() => {
    if (incident) {
      setCurrentStep(incident.current_step);
      setWizardData(incident.wizard_data ?? {});
      setSeverity(incident.severity);
      return;
    }
    if (isNewDraft && localDraft) {
      setCurrentStep(localDraft.currentStep);
      setWizardData(localDraft.wizardData ?? {});
      setSeverity(localDraft.severity);
    }
  }, [incident, isNewDraft, localDraft]);

  useEffect(() => {
    async function loadDeliveryConfig() {
      if (!hasOrg) {
        setProviders([]);
        setDpAutoConfig(null);
        return;
      }
      setProvidersLoading(true);
      try {
        const [providerList, autoConfig] = await Promise.all([
          noticeDeliveryApi.fetchProviders(orgIdParam),
          noticeDeliveryApi.fetchDpNotificationConfig(orgIdParam),
        ]);
        setProviders(providerList);
        setDpAutoConfig(autoConfig);
      } catch (err) {
        console.error('Failed to load notice delivery providers', err);
        setProviders([]);
        setDpAutoConfig(null);
      } finally {
        setProvidersLoading(false);
      }
    }
    void loadDeliveryConfig();
  }, [hasOrg, orgIdParam, currentStep]);

  useEffect(() => {
    if (!dpAutoConfig) return;
    setWizardData((prev) => {
      const updates: Partial<BreachWizardData> = {};
      const shouldAutoChannels =
        !prev.dp_channels?.length || prev.dp_delivery_auto_configured === true;
      if (shouldAutoChannels && dpAutoConfig.default_dp_channels.length > 0) {
        updates.dp_channels = dpAutoConfig.default_dp_channels;
        updates.dp_delivery_auto_configured = true;
      }
      if (!prev.dp_contact?.trim() && dpAutoConfig.default_contact_email) {
        updates.dp_contact = dpAutoConfig.default_contact_email;
      }
      if (!prev.dp_email_subject?.trim()) {
        updates.dp_email_subject = defaultDpEmailSubject(orgName);
      }
      if (!prev.dp_message_body?.trim()) {
        updates.dp_message_body = defaultDpEmailBody();
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [dpAutoConfig, orgName]);

  const selectedDpChannels = wizardData.dp_channels?.length
    ? wizardData.dp_channels
    : dpAutoConfig?.default_dp_channels ?? ['in-app'];
  const channelsMissingProvider = selectedDpChannels.filter((channelId) => {
    const option = DP_CHANNEL_OPTIONS.find((item) => item.id === channelId);
    if (!option?.needsProvider) return false;
    return !configuredProvider(providers, channelId);
  });
  const dpDispatchReady = dpAutoConfig?.dispatch_ready ?? false;

  const handleSaveDraft = async () => {
    await saveDraft(currentStep, severity, wizardData);
    notify(isNewDraft ? 'Draft saved on this device' : 'Draft saved');
  };

  const handleSubmit = async () => {
    if (!canEdit) return;
    const status = evaluateBreachWizardSteps(wizardData);
    if (!status.allComplete) {
      const firstIncomplete = [
        { step: 1, label: 'Impact Assessment', ...status.step1 },
        { step: 2, label: 'DPB Notification', ...status.step2 },
        { step: 3, label: 'DP Notification', ...status.step3 },
        { step: 4, label: 'Public Disclosure', ...status.step4 },
      ].find((item) => !item.complete);
      if (firstIncomplete) {
        setCurrentStep(firstIncomplete.step);
        notify(
          `Complete ${firstIncomplete.label}: ${firstIncomplete.missing.join(', ')}`,
        );
      }
      return;
    }
    try {
      const updated = await submitPackage(5, severity, wizardData);
      if (updated) {
        downloadBreachDisclosurePdf(updated, orgName);
        notify(`Breach package submitted — ${updated.incident_ref}`);
        navigate(`/breach/${updated.id}`);
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to submit breach disclosure');
    }
  };

  const updateField = (patch: Partial<BreachWizardData>) =>
    setWizardData((prev) => ({ ...prev, ...patch }));

  const selectedCategories = wizardData.special_categories ?? [];
  const selectedDataTypes = wizardData.data_types ?? [];

  const toggleCategory = (category: string) => {
    const next = selectedCategories.includes(category)
      ? selectedCategories.filter((item) => item !== category)
      : [...selectedCategories, category];
    updateField({ special_categories: next });
  };

  const removeDataType = (type: string) => {
    updateField({ data_types: selectedDataTypes.filter((item) => item !== type) });
  };

  const addDataType = (type: string) => {
    if (!type || selectedDataTypes.includes(type)) return;
    updateField({ data_types: [...selectedDataTypes, type] });
  };

  const toggleDpChannel = (channelId: string) => {
    const current = wizardData.dp_channels?.length
      ? wizardData.dp_channels
      : dpAutoConfig?.default_dp_channels ?? ['in-app'];
    const next = current.includes(channelId)
      ? current.filter((item) => item !== channelId)
      : [...current, channelId];
    if (next.length === 0) return;
    updateField({ dp_channels: next, dp_delivery_auto_configured: false });
  };

  const selectedPublicationChannels = wizardData.publication_channels ?? [];

  const togglePublicationChannel = (channel: string) => {
    const next = selectedPublicationChannels.includes(channel)
      ? selectedPublicationChannels.filter((item) => item !== channel)
      : [...selectedPublicationChannels, channel];
    updateField({ publication_channels: next });
  };

  const goToProviderAdapters = () => {
    navigate('/consent/provider-adapters');
  };

  const dpEmailSubject =
    wizardData.dp_email_subject?.trim() || defaultDpEmailSubject(orgName);
  const dpEmailBody = wizardData.dp_message_body?.trim() || defaultDpEmailBody();
  const dpbBoard = wizardData.dpb_board || 'Data Protection Board of India';
  const dpbMethod = wizardData.dpb_method || 'Online Portal';
  const affectedCountLabel = wizardData.affected_count?.trim() || '—';

  const startEditingDpPreview = () => {
    setDpPreviewDraft({ subject: dpEmailSubject, body: dpEmailBody });
    setEditingDpPreview(true);
  };

  const cancelEditingDpPreview = () => {
    setEditingDpPreview(false);
  };

  const saveDpPreview = async () => {
    const updated: BreachWizardData = {
      ...wizardData,
      dp_email_subject: dpPreviewDraft.subject.trim(),
      dp_message_body: dpPreviewDraft.body.trim(),
    };
    setWizardData(updated);
    setEditingDpPreview(false);
    setSavingDpPreview(true);
    try {
      await saveDraft(currentStep, severity, updated);
      notify('DP notification email saved');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Failed to save DP notification email');
    } finally {
      setSavingDpPreview(false);
    }
  };

  const handleVerifyFromLogs = async () => {
    if (!hasOrg || verifyingAffected) return;
    setVerifyingAffected(true);
    try {
      const result = await complianceApi.verifyBreachAffectedFromLogs(
        {
          incident_id: incident?.id,
          severity,
          incident_summary: wizardData.incident_summary,
        },
        orgIdParam,
      );
      updateField({
        affected_count: String(result.affected_count),
        ...(result.data_types.length > 0 ? { data_types: result.data_types } : {}),
        ...(result.special_categories.length > 0
          ? { special_categories: result.special_categories }
          : {}),
      });
      const prefix = result.vajra_ai_used ? 'Vajra AI: ' : '';
      notify(`${prefix}${result.summary}`);
    } catch (err) {
      notify(err instanceof ApiError ? err.message : 'Vajra AI verification failed');
    } finally {
      setVerifyingAffected(false);
    }
  };

  const steps = [
    { num: 1, label: 'Impact Assessment' },
    { num: 2, label: 'DPB Notification' },
    { num: 3, label: 'DP Notification' },
    { num: 4, label: 'Public Disclosure' },
    { num: 5, label: 'Submit & Track' },
  ];

  const stepStatus = useMemo(() => evaluateBreachWizardSteps(wizardData), [wizardData]);
  const stepCompletions = [stepStatus.step1, stepStatus.step2, stepStatus.step3, stepStatus.step4];

  const checklistItems = [
    {
      step: 1,
      label: 'Impact Assessment',
      status: stepStatus.step1,
    },
    {
      step: 2,
      label: 'DPB Notification',
      status: stepStatus.step2,
    },
    {
      step: 3,
      label: `DP Notification${
        wizardData.affected_count?.trim() ? ` (${wizardData.affected_count.trim()} individuals)` : ''
      }`,
      status: stepStatus.step3,
    },
    {
      step: 4,
      label: wizardData.public_disclosure_required
        ? 'Public Disclosure (required)'
        : wizardData.public_disclosure_required === false
          ? 'Public Disclosure (not required)'
          : 'Public Disclosure',
      status: stepStatus.step4,
    },
  ];

  return (
    <ConsentManagementGate
      title="Breach Disclosure Wizard"
      loading={loading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
    <div className="p-8 max-w-[1280px] mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="flex items-center gap-3">
            <span>Breach Disclosure Wizard</span>
            <div className="flex items-center gap-2 px-3 py-1 rounded-md bg-red-100 text-red-700 text-base font-normal">
              <Clock className="size-4" />
              <span className="font-mono">{formatRemaining(deadlineRemaining)}</span>
            </div>
          </h1>
          <button
            onClick={() => void handleSaveDraft()}
            disabled={!canEdit}
            className="px-4 py-2 text-sm rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
          >
            Save draft
          </button>
        </div>
        <SectionReference section="DPDPA Section 8(6) — 72-hour breach notification requirement" />
      </div>

      {/* Stepper */}
      <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] p-6 mb-6 sticky top-4 z-10">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isComplete = step.num <= 4 ? stepCompletions[step.num - 1]?.complete : stepStatus.allComplete;
            return (
            <div key={step.num} className="flex items-center">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.num)}
                  className={`size-10 rounded-full flex items-center justify-center font-semibold cursor-pointer transition-colors ${
                    step.num === currentStep
                      ? 'bg-[var(--brand-primary)] text-white'
                      : isComplete
                      ? 'bg-[var(--status-success)] text-white'
                      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-default)] hover:bg-[var(--border-default)]'
                  }`}
                >
                  {isComplete && step.num !== currentStep ? '✓' : step.num}
                </button>
                <div>
                  <div className={`text-sm font-medium ${step.num === currentStep ? 'text-[var(--brand-primary)]' : 'text-[var(--text-secondary)]'}`}>
                    {step.label}
                  </div>
                </div>
              </div>
              {index < 4 && (
                <div className={`w-20 h-0.5 mx-4 ${isComplete ? 'bg-[var(--status-success)]' : 'bg-[var(--border-default)]'}`}></div>
              )}
            </div>
          );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Form Column */}
        <div className="space-y-6">
          {currentStep === 1 && (
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
            <h3 className="font-medium mb-4 text-[var(--text-primary)]">Step 1: Impact Assessment</h3>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Breach Severity</label>
                <div className="space-y-2">
                  {['low', 'medium', 'high', 'critical'].map((sev) => (
                    <label key={sev} className="flex items-center gap-2 p-3 border-2 border-[var(--border-default)] bg-[var(--surface-raised)] rounded-md cursor-pointer hover:border-[var(--border-strong)] text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name="severity"
                        checked={severity === sev}
                        onChange={() => setSeverity(sev)}
                      />
                      <span className="text-sm capitalize">{sev}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Affected Data Principals</label>
                <input
                  type="text"
                  value={wizardData.affected_count ?? ''}
                  onChange={(e) => updateField({ affected_count: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] rounded-md"
                />
                <button
                  type="button"
                  onClick={handleVerifyFromLogs}
                  disabled={!hasOrg || verifyingAffected}
                  className="text-sm text-[var(--brand-primary)] hover:opacity-90 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {verifyingAffected ? 'Analyzing audit logs…' : '✨ Verify from logs with Vajra AI'}
                </button>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Special Categories Affected</label>
                <div className="space-y-2">
                  {SPECIAL_CATEGORY_OPTIONS.map((category) => (
                    <label key={category} className="flex items-center gap-2 text-[var(--text-primary)]">
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category)}
                        onChange={() => toggleCategory(category)}
                      />
                      <span className="text-sm">{category}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Affected Data Types</label>
                <div className="flex flex-wrap gap-2">
                  {selectedDataTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => removeDataType(type)}
                      className="px-3 py-1 text-sm rounded-md border-2 border-[var(--brand-primary)] bg-[var(--status-info-bg)] text-[var(--status-info)] cursor-pointer"
                    >
                      {type} ×
                    </button>
                  ))}
                  {selectedDataTypes.length === 0 && (
                    <span className="text-sm text-[var(--text-tertiary)]">No data types selected.</span>
                  )}
                </div>
                <select
                  value=""
                  onChange={(e) => addDataType(e.target.value)}
                  className="mt-2 w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                >
                  <option value="">Add data type…</option>
                  {DATA_TYPE_OPTIONS.filter((type) => !selectedDataTypes.includes(type)).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Mitigation Actions Taken</label>
                <textarea
                  rows={4}
                  value={wizardData.mitigation_actions ?? ''}
                  onChange={(e) => updateField({ mitigation_actions: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] rounded-md"
                />
              </div>
            </div>
          </div>
          )}

          {currentStep === 2 && (
            <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
              <h3 className="font-medium mb-4 text-[var(--text-primary)]">Step 2: DPB Notification</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Data Protection Board</label>
                  <select
                    value={dpbBoard}
                    onChange={(e) => updateField({ dpb_board: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  >
                    <option>Data Protection Board of India</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Notification Method</label>
                  <select
                    value={dpbMethod}
                    onChange={(e) => updateField({ dpb_method: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  >
                    <option>Online Portal</option>
                    <option>Email</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Incident Summary</label>
                  <textarea
                    rows={4}
                    value={wizardData.incident_summary ?? ''}
                    onChange={(e) => updateField({ incident_summary: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Remediation Steps</label>
                  <textarea
                    rows={3}
                    value={wizardData.remediation_steps ?? ''}
                    onChange={(e) => updateField({ remediation_steps: e.target.value })}
                    className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6 font-sans">
              <h3 className="font-medium mb-4 text-[var(--text-primary)]">Step 3: Data Principal (DP) Notification</h3>

              {dpDispatchReady ? (
                <div className="p-4 mb-4 bg-[var(--status-success-bg)] border border-[var(--status-success)]/20 text-[var(--status-success)] rounded-lg flex items-start gap-3">
                  <Check className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <span className="font-bold block mb-1">Delivery channels auto-configured</span>
                    DP notification will dispatch via{' '}
                    {Object.entries(dpAutoConfig?.providers_by_channel ?? {})
                      .map(([channel, name]) => `${channel} (${name})`)
                      .join(', ')}
                    . Channels and credentials are managed in Pluggable Provider Adapters — no extra
                    setup is required in this wizard.
                  </div>
                </div>
              ) : channelsMissingProvider.length > 0 ? (
                <div className="p-4 mb-4 bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
                  <div className="text-xs">
                    <span className="font-bold block mb-1">Notice delivery provider required</span>
                    Selected channel
                    {channelsMissingProvider.length > 1 ? 's' : ''} (
                    {channelsMissingProvider
                      .map((id) => DP_CHANNEL_OPTIONS.find((item) => item.id === id)?.label ?? id)
                      .join(', ')}
                    ){' '}
                    {channelsMissingProvider.length > 1 ? 'need' : 'needs'} an active provider with
                    complete credentials on the{' '}
                    <button
                      type="button"
                      onClick={goToProviderAdapters}
                      className="font-semibold underline cursor-pointer text-[var(--brand-primary)]"
                    >
                      Pluggable Provider Adapters
                    </button>{' '}
                    page. Once saved there, this step updates automatically.
                  </div>
                </div>
              ) : null}

              <div className="mb-4 p-4 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className="text-sm font-medium text-[var(--text-primary)]">
                    Configured delivery providers
                  </span>
                  <button
                    type="button"
                    onClick={goToProviderAdapters}
                    className="text-xs text-[var(--brand-primary)] hover:opacity-90 cursor-pointer"
                  >
                    Manage providers →
                  </button>
                </div>
                {providersLoading ? (
                  <p className="text-xs text-[var(--text-tertiary)]">Loading provider registry…</p>
                ) : (
                  <div className="space-y-1.5">
                    {DP_CHANNEL_OPTIONS.filter((item) => item.needsProvider).map((item) => {
                      const provider = configuredProvider(providers, item.id);
                      return (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs text-[var(--text-secondary)]"
                        >
                          <span>{item.label}</span>
                          {provider ? (
                            <span className="text-[var(--status-success)]">
                              ✓ {provider.provider_name} (configured)
                            </span>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-300">Not configured</span>
                          )}
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span>In-app notification</span>
                      <span className="text-[var(--status-success)]">✓ Available via platform</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                    Notification Channel
                  </label>
                  <div className="space-y-2">
                    {DP_CHANNEL_OPTIONS.map((channel) => {
                      const checked = selectedDpChannels.includes(channel.id);
                      const providerReady =
                        !channel.needsProvider || Boolean(configuredProvider(providers, channel.id));
                      const readOnly = dpDispatchReady && wizardData.dp_delivery_auto_configured;
                      return (
                        <label
                          key={channel.id}
                          className={`flex items-center justify-between gap-2 text-[var(--text-primary)] ${
                            readOnly ? 'opacity-90' : ''
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={readOnly}
                              onChange={() => toggleDpChannel(channel.id)}
                            />
                            <span className="text-sm">{channel.label}</span>
                          </span>
                          <span
                            className={`text-xs ${
                              providerReady
                                ? 'text-[var(--status-success)]'
                                : 'text-amber-600 dark:text-amber-300'
                            }`}
                          >
                            {channel.needsProvider
                              ? providerReady
                                ? 'Auto-configured'
                                : 'Needs provider'
                              : 'Built-in'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                {selectedDpChannels.includes('email') && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                        Email Subject
                      </label>
                      <input
                        type="text"
                        value={wizardData.dp_email_subject ?? ''}
                        placeholder={defaultDpEmailSubject(orgName)}
                        onChange={(e) => updateField({ dp_email_subject: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                        Message Body
                      </label>
                      <textarea
                        rows={6}
                        value={wizardData.dp_message_body ?? ''}
                        placeholder={defaultDpEmailBody()}
                        onChange={(e) => updateField({ dp_message_body: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                        Recipient Email / Contact
                      </label>
                      <input
                        type="text"
                        value={wizardData.dp_contact ?? ''}
                        placeholder="compliance@yourorg.in"
                        onChange={(e) => updateField({ dp_contact: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                  </>
                )}
                {selectedDpChannels.includes('sms') && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      Recipient Phone (SMS)
                    </label>
                    <input
                      type="text"
                      value={wizardData.dp_recipient_phone ?? ''}
                      placeholder="+91XXXXXXXXXX"
                      onChange={(e) => updateField({ dp_recipient_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                )}
                {selectedDpChannels.includes('physical') && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      Mailing Address
                    </label>
                    <textarea
                      rows={3}
                      value={wizardData.dp_recipient_address ?? ''}
                      placeholder="Recipient name and postal address"
                      onChange={(e) => updateField({ dp_recipient_address: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                )}
                {!selectedDpChannels.includes('email') && (
                  <div>
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">
                      Notice Subject
                    </label>
                    <input
                      type="text"
                      value={wizardData.dp_email_subject ?? ''}
                      placeholder={defaultDpEmailSubject(orgName)}
                      onChange={(e) => updateField({ dp_email_subject: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                    <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 mt-4 block">
                      Notice Message
                    </label>
                    <textarea
                      rows={4}
                      value={wizardData.dp_message_body ?? ''}
                      placeholder={defaultDpEmailBody()}
                      onChange={(e) => updateField({ dp_message_body: e.target.value })}
                      className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 4 && (
            <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
              <h3 className="font-medium mb-4 text-[var(--text-primary)]">Step 4: Public Disclosure</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Is public disclosure required?</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name="disclosure"
                        checked={wizardData.public_disclosure_required === true}
                        onChange={() => updateField({ public_disclosure_required: true })}
                      />
                      <span className="text-sm">Yes - High-risk breach affecting multiple individuals</span>
                    </label>
                    <label className="flex items-center gap-2 text-[var(--text-primary)]">
                      <input
                        type="radio"
                        name="disclosure"
                        checked={wizardData.public_disclosure_required === false}
                        onChange={() =>
                          updateField({
                            public_disclosure_required: false,
                            publication_channels: [],
                            public_statement: '',
                          })
                        }
                      />
                      <span className="text-sm">No - Limited scope, low risk</span>
                    </label>
                  </div>
                </div>
                {wizardData.public_disclosure_required && (
                  <>
                    <div>
                      <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Publication Channels</label>
                      <div className="space-y-2 text-[var(--text-primary)]">
                        {PUBLICATION_CHANNEL_OPTIONS.map((channel) => (
                          <label key={channel} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedPublicationChannels.includes(channel)}
                              onChange={() => togglePublicationChannel(channel)}
                            />
                            <span className="text-sm">{channel}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[var(--text-secondary)] mb-2 block">Public Statement</label>
                      <textarea
                        rows={5}
                        value={wizardData.public_statement ?? ''}
                        placeholder={`${orgName || 'Our organization'} has identified a security incident affecting personal data. We have taken immediate action and are working with authorities.`}
                        onChange={(e) => updateField({ public_statement: e.target.value })}
                        className="w-full px-3 py-2 border border-[var(--border-default)] bg-[var(--surface-raised)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {currentStep === 5 && (
            <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
              <h3 className="font-medium mb-4 text-[var(--text-primary)]">Step 5: Submit & Track</h3>
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-lg border ${
                    stepStatus.allComplete
                      ? 'bg-[var(--status-success-bg)] border-green-500/20'
                      : 'bg-amber-500/10 border-amber-500/20'
                  }`}
                >
                  <div
                    className={`font-medium mb-2 ${
                      stepStatus.allComplete
                        ? 'text-green-950 dark:text-green-200'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    {stepStatus.allComplete ? '✓ All steps completed' : 'Complete required steps before submitting'}
                  </div>
                  <div
                    className={`text-sm ${
                      stepStatus.allComplete
                        ? 'text-green-800 dark:text-green-300'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {stepStatus.allComplete
                      ? 'Ready to submit breach disclosure package'
                      : 'Review the checklist below and fill in missing fields.'}
                  </div>
                </div>
                <div className="space-y-2">
                  {checklistItems.map((item) => (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setCurrentStep(item.step)}
                      className="w-full flex items-center justify-between p-3 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded text-[var(--text-primary)] hover:bg-black/5 cursor-pointer text-left"
                    >
                      <span className="text-sm">{item.label}</span>
                      {item.status.complete ? (
                        <span className="text-sm text-[var(--status-success)]">✓ Complete</span>
                      ) : (
                        <span className="text-sm text-amber-600 dark:text-amber-300">
                          {item.status.missing.length} missing
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                {channelsMissingProvider.length > 0 && !dpDispatchReady && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Note:{' '}
                    {channelsMissingProvider
                      .map((id) => DP_CHANNEL_OPTIONS.find((item) => item.id === id)?.label ?? id)
                      .join(', ')}{' '}
                    channel(s) need providers configured in Pluggable Provider Adapters before dispatch.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!canEdit || !stepStatus.allComplete}
                  className="w-full px-4 py-3 rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Breach Disclosure Package
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview Column */}
        <div className="space-y-6">
          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle className="size-5 text-amber-600" />
              <h3 className="font-medium text-[var(--text-primary)]">Live Preview: DPB Notification</h3>
            </div>

            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] rounded-lg p-4 text-sm space-y-3">
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Incident Reference</div>
                <div className="font-mono font-medium text-[var(--text-primary)]">
                  {incident?.incident_ref ?? (isNewDraft ? 'Draft (assigned on submit)' : '—')}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Reporting Entity</div>
                <div className="text-[var(--text-primary)]">{orgName || '—'}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Data Protection Board</div>
                <div className="text-[var(--text-primary)]">{dpbBoard}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Notification Method</div>
                <div className="text-[var(--text-primary)]">{dpbMethod}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">72-Hour Deadline</div>
                <div className="text-[var(--text-primary)]">{formatRemaining(deadlineRemaining)}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Affected Data Principals</div>
                <div className="text-[var(--text-primary)]">{affectedCountLabel}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Breach Summary</div>
                <div className="text-[var(--text-primary)] whitespace-pre-wrap">
                  {wizardData.incident_summary?.trim() || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Remediation Steps</div>
                <div className="text-[var(--text-primary)] whitespace-pre-wrap">
                  {wizardData.remediation_steps?.trim() || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Mitigation Actions</div>
                <div className="text-[var(--text-primary)] whitespace-pre-wrap">
                  {wizardData.mitigation_actions?.trim() || '—'}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Severity</div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border uppercase ${severityBadgeClass(severity)}`}
                >
                  {severity}
                </span>
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Special Categories</div>
                {selectedCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedCategories.map((category) => (
                      <span
                        key={category}
                        className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs border border-amber-500/20"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--text-primary)]">—</div>
                )}
              </div>
              <div>
                <div className="text-xs text-[var(--text-tertiary)] mb-1">Affected Data Types</div>
                {selectedDataTypes.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {selectedDataTypes.map((type) => (
                      <span
                        key={type}
                        className="inline-flex items-center px-2 py-0.5 rounded bg-[var(--status-ai-bg)] text-[var(--status-ai)] text-xs border border-purple-500/20"
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="text-[var(--text-primary)]">—</div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[var(--surface-card)] text-[var(--text-primary)] border border-[var(--border-default)] rounded-lg p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-medium text-[var(--text-primary)]">Live Preview: DP Notification Email</h3>
              {!editingDpPreview ? (
                <button
                  type="button"
                  onClick={startEditingDpPreview}
                  disabled={!canEdit}
                  className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-primary)] hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Pencil className="size-3.5" />
                  Edit
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEditingDpPreview}
                    disabled={savingDpPreview}
                    className="inline-flex items-center gap-1 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveDpPreview()}
                    disabled={savingDpPreview}
                    className="inline-flex items-center gap-1 text-sm text-[var(--brand-primary)] hover:opacity-90 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="size-3.5" />
                    {savingDpPreview ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-[var(--surface-raised)] border border-[var(--border-default)] text-[var(--text-secondary)] rounded-lg p-4 text-sm">
              {editingDpPreview ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Subject</label>
                    <input
                      type="text"
                      value={dpPreviewDraft.subject}
                      onChange={(e) =>
                        setDpPreviewDraft((prev) => ({ ...prev, subject: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] font-medium"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Message body</label>
                    <textarea
                      rows={12}
                      value={dpPreviewDraft.body}
                      onChange={(e) =>
                        setDpPreviewDraft((prev) => ({ ...prev, body: e.target.value }))
                      }
                      className="w-full px-2 py-1.5 border border-[var(--border-default)] bg-[var(--surface-card)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)] leading-relaxed resize-y"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-xs text-[var(--text-tertiary)] mb-1">Delivery channels</div>
                    <div className="flex flex-wrap gap-1">
                      {selectedDpChannels.map((channelId) => {
                        const label =
                          DP_CHANNEL_OPTIONS.find((item) => item.id === channelId)?.label ?? channelId;
                        const ready =
                          channelId === 'in-app' || Boolean(configuredProvider(providers, channelId));
                        return (
                          <span
                            key={channelId}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${
                              ready
                                ? 'bg-[var(--status-success-bg)] text-[var(--status-success)] border-green-500/20'
                                : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
                            }`}
                          >
                            {label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="font-medium mb-2 text-[var(--text-primary)]">
                    Subject: {dpEmailSubject}
                  </div>
                  <div className="text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {dpEmailBody}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {currentStep > 1 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="flex-1 px-4 py-3 rounded-md border border-[var(--border-default)] hover:bg-[var(--surface-raised)] text-[var(--text-primary)] font-medium cursor-pointer"
              >
                ← Previous
              </button>
            )}
            {currentStep < 5 && (
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="flex-1 px-4 py-3 rounded-md bg-[var(--brand-primary)] text-white hover:opacity-90 font-medium cursor-pointer"
              >
                Continue to Step {currentStep + 1} →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </ConsentManagementGate>
  );
}
