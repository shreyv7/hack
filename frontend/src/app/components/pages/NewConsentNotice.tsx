import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/app/components/ui/Button';
import { Stepper } from '@/app/components/notices/Stepper';
import { NoticeForm } from '@/app/components/notices/NoticeForm';
import { NoticePreview } from '@/app/components/notices/NoticePreview';
import { NoticePurposePicker } from '@/app/components/notices/NoticePurposePicker';
import { NoticeComplianceWarnings } from '@/app/components/notices/NoticeComplianceWarnings';
import { ConsentManagementGate } from '@/app/components/pages/ConsentManagementGate';
import type { NoticeFormData, Page } from '@/types';
import { useConsentManagement } from '@/hooks/useConsentManagement';
import { notify } from '@/app/utils/notify';
import { ApiError } from '@/lib/api/client';
import {
  noticeFormToCreatePayload,
  noticeFormToVersionUpdate,
  versionToFormData,
} from '@/types/consent';
import { Modal } from '@/app/components/ui/Modal';
import { fetchWorkspace } from '@/lib/api/workspace';
import { submitNoticeForReview } from '@/lib/api/consent';
import type { NoticeVersionStatus } from '@/types/consent';

const BANKING_INDUSTRY = 'Banking & Financial Services';

const APPROVAL_STATUS_LABELS: Record<string, string> = {
  pending_legal: 'Pending Legal Review',
  pending_dpo: 'Pending DPO Approval',
  dpo_approved: 'DPO Approved — Ready to Publish',
};


interface NewConsentNoticeProps {
  noticeId?: string | null;
  versionId?: string | null;
  onCancel: () => void;
  onPublished?: () => void;
  onOpenMultiLanguageEditor?: () => void;
  registerNavigationGuard?: (guard: ((targetPage: Page) => Promise<boolean>) | null) => void;
  onNavigate?: (page: Page) => void;
}

const INITIAL_FORM_DATA: NoticeFormData = {
  noticeTitle: '',
  displayName: '',
  language: 'English',
  openingStatement: '',
  contactEmail: '',
  contactWebsite: '',
  dpoName: '',
  dpoEmail: '',
  rightsExercise: '',
  complaintProcess: '',
  retentionPolicy: '',
  grievanceOfficerName: '',
  dpbiEscalationText: 'If your grievances are not resolved by the Data Fiduciary within 30 days, you have the statutory legal right to lodge a complaint directly with the Data Protection Board of India (DPBI) at https://dpboard.gov.in.',
  consentWithdrawalMethod: 'Users may withdraw their consent at any time via the Rights Portal toggle below, or by contacting the DPO directly.',
  dataCategories: '',
};

export function NewConsentNotice({
  noticeId: initialNoticeId = null,
  versionId: initialVersionId = null,
  onCancel,
  onPublished,
  onOpenMultiLanguageEditor,
  registerNavigationGuard,
  onNavigate,
}: NewConsentNoticeProps): ReactElement {
  const {
    purposes,
    loading,
    error,
    hasOrg,
    canEdit,
    isSuperadmin,
    organizations,
    selectedOrgId,
    setSelectedOrgId,
    createNotice,
    getNotice,
    updateNoticeVersion,
    setVersionPurposes,
    publishVersion,
    runComplianceCheck,
  } = useConsentManagement();

  const location = useLocation();
  const [showAiBanner, setShowAiBanner] = useState(false);
  const [orgSlug, setOrgSlug] = useState('demo-org');
  const [isBankingOrg, setIsBankingOrg] = useState(false);
  const [versionStatus, setVersionStatus] = useState<NoticeVersionStatus>('draft');

  useEffect(() => {
    const loadOrgSlug = async () => {
      try {
        const effectiveId = isSuperadmin ? selectedOrgId : undefined;
        const ws = await fetchWorkspace(effectiveId);
        if (ws?.organization?.slug) {
          setOrgSlug(ws.organization.slug);
        }
        setIsBankingOrg(ws?.primary_industry === BANKING_INDUSTRY);
      } catch (err) {
        console.error('Failed to load workspace for withdrawal URL:', err);
      }
    };
    if (hasOrg) {
      void loadOrgSlug();
    }
  }, [hasOrg, selectedOrgId, isSuperadmin]);

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<NoticeFormData>(INITIAL_FORM_DATA);
  const [noticeId, setNoticeId] = useState<string | null>(initialNoticeId);
  const [versionId, setVersionId] = useState<string | null>(initialVersionId);
  const [selectedPurposeIds, setSelectedPurposeIds] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<{ code: string; message: string }[]>([]);

  useEffect(() => {
    if (location.state && (location.state as any).aiDraft && !initialNoticeId) {
      const draft = (location.state as any).aiDraft;
      const mappedFormData: NoticeFormData = {
        noticeTitle: draft.notice_title || '',
        displayName: draft.display_name || '',
        language: draft.language || 'English',
        openingStatement: draft.opening_statement || '',
        contactEmail: draft.contact_email || '',
        contactWebsite: draft.contact_website || '',
        dpoName: draft.dpo_name || '',
        dpoEmail: draft.dpo_email || '',
        rightsExercise: draft.rights_exercise || '',
        complaintProcess: draft.complaint_process || '',
        retentionPolicy: draft.retention_policy || '',
        grievanceOfficerName: draft.dpo_name || '',
        dpbiEscalationText: INITIAL_FORM_DATA.dpbiEscalationText,
        consentWithdrawalMethod: INITIAL_FORM_DATA.consentWithdrawalMethod,
        dataCategories: '',
      };
      setFormData(mappedFormData);
      setSavedFormData(mappedFormData);
      setShowAiBanner(true);
      // Clear location state so navigating back/forth does not re-apply the draft
      window.history.replaceState({}, document.title);
    }
  }, [location.state, initialNoticeId]);

  const [saving, setSaving] = useState(false);
  const [bootLoading, setBootLoading] = useState(Boolean(initialNoticeId));
  const isEditing = Boolean(initialNoticeId);
  const bootstrappedKeyRef = useRef<string | null>(null);

  // References for detecting dirty state
  const [savedFormData, setSavedFormData] = useState<NoticeFormData>(INITIAL_FORM_DATA);
  const [savedPurposeIds, setSavedPurposeIds] = useState<string[]>([]);

  // Modals state for auto-save and recovery
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [pendingNavigatePage, setPendingNavigatePage] = useState<Page | null>(null);

  const backupKey = initialNoticeId
    ? `dpdpa-consent-notice-draft-backup-${initialNoticeId}`
    : 'dpdpa-consent-notice-draft-backup-new';

  const isDirty =
    JSON.stringify(formData) !== JSON.stringify(savedFormData) ||
    JSON.stringify(selectedPurposeIds.slice().sort()) !== JSON.stringify(savedPurposeIds.slice().sort());

  useEffect(() => {
    if (!initialNoticeId) {
      bootstrappedKeyRef.current = null;
      setBootLoading(false);
      return;
    }

    const bootKey = `${initialNoticeId}:${initialVersionId ?? ''}`;
    if (bootstrappedKeyRef.current === bootKey) return;

    let cancelled = false;
    void (async () => {
      setBootLoading(true);
      try {
        const detail = await getNotice(initialNoticeId);
        const draft =
          detail.versions.find((v) => v.id === initialVersionId) ??
          detail.versions.find((v) => v.status === 'draft') ??
          detail.versions[0];
        if (!draft || cancelled) return;
        setNoticeId(detail.id);
        setVersionId(draft.id);
        const loadedForm = {
          ...versionToFormData(draft),
          noticeTitle: detail.internal_name,
        };
        setFormData(loadedForm);
        setSavedFormData(loadedForm);
        setSelectedPurposeIds(draft.purpose_ids);
        setSavedPurposeIds(draft.purpose_ids);
        setWarnings(draft.compliance_warnings);
        setVersionStatus(draft.status);
        setStep(1);
        bootstrappedKeyRef.current = bootKey;
      } catch (e) {
        notify(e instanceof ApiError ? e.message : 'Failed to load notice');
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialNoticeId, initialVersionId, getNotice]);

  const ensureDraft = async (): Promise<{ noticeId: string; versionId: string } | null> => {
    if (!formData.noticeTitle.trim()) {
      notify('Notice title (internal name) is required');
      return null;
    }
    if (noticeId && versionId) {
      return { noticeId, versionId };
    }
    setSaving(true);
    try {
      const detail = await createNotice(noticeFormToCreatePayload(formData));
      const draft = detail.versions.find((v) => v.status === 'draft') ?? detail.versions[0];
      setNoticeId(detail.id);
      setVersionId(draft.id);
      setSavedFormData({
        ...versionToFormData(draft),
        noticeTitle: detail.internal_name,
      });
      setSavedPurposeIds(draft.purpose_ids);
      return { noticeId: detail.id, versionId: draft.id };
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to create notice');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveDraftSilent = async (): Promise<boolean> => {
    try {
      if (!formData.noticeTitle.trim()) {
        return false;
      }
      let currentNoticeId = noticeId;
      let currentVersionId = versionId;

      if (!currentNoticeId || !currentVersionId) {
        const detail = await createNotice(noticeFormToCreatePayload(formData));
        const draft = detail.versions.find((v) => v.status === 'draft') ?? detail.versions[0];
        setNoticeId(detail.id);
        setVersionId(draft.id);
        currentNoticeId = detail.id;
        currentVersionId = draft.id;
        
        if (selectedPurposeIds.length > 0) {
          await setVersionPurposes(currentNoticeId, currentVersionId, selectedPurposeIds);
        }
        
        setSavedFormData({
          ...versionToFormData(draft),
          noticeTitle: detail.internal_name,
        });
        setSavedPurposeIds(selectedPurposeIds);
      } else {
        const updated = await updateNoticeVersion(
          currentNoticeId,
          currentVersionId,
          noticeFormToVersionUpdate(formData)
        );
        
        const purposesChanged = JSON.stringify(selectedPurposeIds.slice().sort()) !== JSON.stringify(savedPurposeIds.slice().sort());
        if (purposesChanged) {
          await setVersionPurposes(currentNoticeId, currentVersionId, selectedPurposeIds);
          setSavedPurposeIds(selectedPurposeIds);
        }
        
        setWarnings(updated.compliance_warnings);
        setSavedFormData(formData);
      }
      return true;
    } catch (e) {
      console.error('Failed to auto-save draft:', e);
      return false;
    }
  };

  const saveDraft = async () => {
    const ids = await ensureDraft();
    if (!ids) return;
    setSaving(true);
    try {
      const updated = await updateNoticeVersion(
        ids.noticeId,
        ids.versionId,
        noticeFormToVersionUpdate(formData)
      );
      const purposesChanged = JSON.stringify(selectedPurposeIds.slice().sort()) !== JSON.stringify(savedPurposeIds.slice().sort());
      if (purposesChanged) {
        await setVersionPurposes(ids.noticeId, ids.versionId, selectedPurposeIds);
        setSavedPurposeIds(selectedPurposeIds);
      }
      setWarnings(updated.compliance_warnings);
      setSavedFormData(formData);
      notify('Draft saved');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const goToStep2 = async () => {
    const ids = await ensureDraft();
    if (!ids) return;
    setSaving(true);
    try {
      const updated = await updateNoticeVersion(
        ids.noticeId,
        ids.versionId,
        noticeFormToVersionUpdate(formData)
      );
      setWarnings(updated.compliance_warnings);
      setSavedFormData(formData);
      setStep(2);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save step 1');
    } finally {
      setSaving(false);
    }
  };

  const goToStep3 = async () => {
    if (!noticeId || !versionId) {
      notify('Notice draft is still loading — try again in a moment');
      return;
    }
    setSaving(true);
    try {
      const updated = await setVersionPurposes(noticeId, versionId, selectedPurposeIds);
      setWarnings(updated.compliance_warnings);
      setSavedPurposeIds(selectedPurposeIds);
      setStep(3);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to save purposes');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoFix = async () => {
    if (!noticeId || !versionId) return;
    setSaving(true);
    try {
      const result = await runComplianceCheck(noticeId, versionId, true);
      setWarnings(result.warnings);
      const detail = await getNotice(noticeId);
      const v = detail.versions.find((x) => x.id === versionId);
      if (v) {
        const loadedForm = {
          ...versionToFormData(v),
          noticeTitle: formData.noticeTitle,
        };
        setFormData(loadedForm);
        setSavedFormData(loadedForm);
      }
      if (result.warnings.length === 0) {
        notify('Auto-fix applied — all warnings resolved');
      } else if (result.auto_fixed) {
        notify(`Auto-fix applied — ${result.warnings.length} warning(s) remaining`);
      } else {
        notify('No automatic fix available for the remaining warnings');
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Compliance check failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!noticeId || !versionId) return;
    setSaving(true);
    try {
      await updateNoticeVersion(noticeId, versionId, noticeFormToVersionUpdate(formData));
      await setVersionPurposes(noticeId, versionId, selectedPurposeIds);
      const check = await runComplianceCheck(noticeId, versionId, false);
      setWarnings(check.warnings);
      if (check.warnings.length > 0) {
        notify('Resolve compliance warnings before publishing');
        return;
      }
      await publishVersion(noticeId, versionId);
      setVersionStatus('live');
      setSavedFormData(formData);
      setSavedPurposeIds(selectedPurposeIds);
      localStorage.removeItem(backupKey);
      notify('Notice published successfully');
      onPublished?.();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to publish notice');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!noticeId || !versionId) return;
    setSaving(true);
    try {
      await updateNoticeVersion(noticeId, versionId, noticeFormToVersionUpdate(formData));
      await setVersionPurposes(noticeId, versionId, selectedPurposeIds);
      const check = await runComplianceCheck(noticeId, versionId, false);
      setWarnings(check.warnings);
      if (check.warnings.length > 0) {
        notify('Resolve compliance warnings before submitting for review');
        return;
      }
      const orgId = isSuperadmin ? selectedOrgId || undefined : undefined;
      const updated = await submitNoticeForReview(noticeId, versionId, orgId);
      setVersionStatus(updated.status);
      setSavedFormData(formData);
      setSavedPurposeIds(selectedPurposeIds);
      localStorage.removeItem(backupKey);
      notify('Notice submitted for legal review');
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Failed to submit notice for review');
    } finally {
      setSaving(false);
    }
  };

  const isReadOnlyVersion =
    versionStatus !== 'draft' &&
    versionStatus !== 'pending_legal' &&
    versionStatus !== 'pending_dpo' &&
    versionStatus !== 'dpo_approved';
  const canSubmitForReview = isBankingOrg && versionStatus === 'draft';
  const canPublish =
    (!isBankingOrg && versionStatus === 'draft') ||
    (isBankingOrg && versionStatus === 'dpo_approved');

  const stateRef = useRef({ formData, selectedPurposeIds, savedFormData, savedPurposeIds, isDirty, saveDraftSilent });
  useEffect(() => {
    stateRef.current = { formData, selectedPurposeIds, savedFormData, savedPurposeIds, isDirty, saveDraftSilent };
  });

  // Client-side Navigation Guard
  useEffect(() => {
    if (!registerNavigationGuard) return;

    const guard = async (targetPage: Page): Promise<boolean> => {
      const { formData: currentForm, isDirty: dirty, saveDraftSilent: saveSilent } = stateRef.current;
      if (!dirty) {
        return true;
      }

      if (!currentForm.noticeTitle.trim()) {
        setPendingNavigatePage(targetPage);
        setShowWarningModal(true);
        return false;
      }

      setSaving(true);
      const success = await saveSilent();
      setSaving(false);

      if (success) {
        setPendingNavigatePage(targetPage);
        setShowSavedModal(true);
      } else {
        notify('Failed to auto-save draft');
        setPendingNavigatePage(targetPage);
        setShowWarningModal(true);
      }
      return false;
    };

    registerNavigationGuard(guard);
    return () => {
      registerNavigationGuard(null);
    };
  }, [registerNavigationGuard]);

  // Browser Unload / Refresh Guard
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // Local Backup State as they type / edit
  useEffect(() => {
    if (isDirty) {
      const backupData = {
        formData,
        selectedPurposeIds,
        noticeId,
        versionId,
      };
      localStorage.setItem(backupKey, JSON.stringify(backupData));
    } else {
      localStorage.removeItem(backupKey);
    }
  }, [formData, selectedPurposeIds, noticeId, versionId, isDirty, backupKey]);

  // Recover Local Draft on Mount
  useEffect(() => {
    const stored = localStorage.getItem(backupKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.formData) {
          setShowRecoveryModal(true);
        }
      } catch (e) {
        console.error('Failed to parse backup draft', e);
      }
    }
  }, [backupKey]);

  const handleRestoreBackup = () => {
    const stored = localStorage.getItem(backupKey);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setFormData(parsed.formData);
        setSelectedPurposeIds(parsed.selectedPurposeIds || []);
        if (parsed.noticeId) setNoticeId(parsed.noticeId);
        if (parsed.versionId) setVersionId(parsed.versionId);
        setSavedFormData(parsed.formData);
        setSavedPurposeIds(parsed.selectedPurposeIds || []);
      } catch (e) {
        console.error('Failed to restore backup', e);
      }
    }
    setShowRecoveryModal(false);
  };

  const handleDiscardBackup = () => {
    localStorage.removeItem(backupKey);
    setShowRecoveryModal(false);
  };

  const proceedNavigation = () => {
    // Reset dirty state to avoid triggering guards
    setSavedFormData(formData);
    setSavedPurposeIds(selectedPurposeIds);
    localStorage.removeItem(backupKey);
    if (pendingNavigatePage && onNavigate) {
      onNavigate(pendingNavigatePage);
    }
    setPendingNavigatePage(null);
  };

  const steps = [
    { number: 1, label: 'Basic Info', active: step === 1 },
    { number: 2, label: 'Add Purposes', active: step === 2 },
    { number: 3, label: 'Preview & Publish', active: step === 3 },
  ];

  return (
    <ConsentManagementGate
      title={isEditing ? 'Edit Consent Notice' : 'New Consent Notice'}
      loading={(loading && !noticeId) || bootLoading}
      error={error}
      hasOrg={hasOrg}
      isSuperadmin={isSuperadmin}
      organizations={organizations}
      selectedOrgId={selectedOrgId}
      onSelectOrg={setSelectedOrgId}
    >
      {!canEdit ? (
        <div className="p-8 text-[var(--text-secondary)]">You do not have permission to edit consent notices.</div>
      ) : (
        <div className="flex flex-col min-h-[calc(100dvh-7rem)]">
      <div className="sticky top-0 z-10 border-b bg-[var(--surface-card)] border-[var(--border-default)]">
        <div className="max-w-7xl mx-auto px-8 py-4 flex flex-col gap-3">
          <Stepper steps={steps} />
          {versionStatus !== 'draft' && versionStatus !== 'live' && APPROVAL_STATUS_LABELS[versionStatus] && (
            <div className="inline-flex items-center self-start px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-700 border border-amber-500/20">
              {APPROVAL_STATUS_LABELS[versionStatus]}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-8">
              {step === 1 && (
          <div className="grid grid-cols-5 gap-8">
                  <div className="col-span-3 space-y-4">
                    {showAiBanner && (
                      <div className="flex items-start justify-between p-4 rounded-xl bg-gradient-to-r from-violet-600/10 to-indigo-600/10 border border-violet-500/20 text-[var(--text-primary)]">
                        <div className="flex gap-3">
                          <div className="p-1.5 rounded-lg bg-violet-500/20 text-violet-600 mt-0.5">
                            <Sparkles className="size-4" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm">Drafted by Vajra AI</h4>
                            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                              This consent notice was automatically drafted by Vajra AI. All fields have been pre-filled and remain fully editable.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowAiBanner(false)}
                          className="p-1 rounded-md hover:bg-black/5 transition-colors"
                        >
                          <X className="size-4 text-[var(--text-secondary)]" />
                        </button>
                      </div>
                    )}
                    <NoticeForm
                      formData={formData}
                      setFormData={setFormData}
                      onAddLanguage={onOpenMultiLanguageEditor}
                      orgSlug={orgSlug}
                    />
            </div>
            <div className="col-span-2">
              <div className="sticky top-8">
                      <NoticePreview formData={formData} selectedPurposes={purposes.filter((p) => selectedPurposeIds.includes(p.id))} />
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="max-w-2xl">
                  <h2 className="text-lg font-semibold mb-2">Link processing purposes</h2>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">
                    DPDPA Section 6 requires consent to be specific to stated purposes. Select purposes from your
                    registry.
                  </p>
                  <NoticePurposePicker
                    purposes={purposes}
                    selectedIds={selectedPurposeIds}
                    onChange={setSelectedPurposeIds}
                  />
                </div>
              )}

              {step === 3 && (
                <div className="grid grid-cols-5 gap-8">
                  <div className="col-span-3 space-y-6">
                    <NoticeComplianceWarnings
                      warnings={warnings}
                      onAutoFix={() => void handleAutoFix()}
                      fixing={saving}
                    />
                    <div>
                      <h3 className="font-medium mb-2">Linked purposes ({selectedPurposeIds.length})</h3>
                      <ul className="text-sm text-[var(--text-secondary)] list-disc pl-5 space-y-1">
                        {purposes
                          .filter((p) => selectedPurposeIds.includes(p.id))
                          .map((p) => (
                            <li key={p.id}>{p.name}</li>
                          ))}
                      </ul>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <NoticePreview formData={formData} selectedPurposes={purposes.filter((p) => selectedPurposeIds.includes(p.id))} />
                  </div>
              </div>
              )}
        </div>
      </div>

          <div className="sticky bottom-0 z-10 shrink-0 border-t bg-[var(--surface-card)] border-[var(--border-default)] shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="max-w-7xl mx-auto px-8 py-4 flex items-center justify-between">
              <Button variant="ghost" size="md" disabled={saving} onClick={() => void saveDraft()}>
            Save Draft
          </Button>
          <div className="flex gap-3">
            <Button variant="secondary" size="md" onClick={onCancel}>
              Cancel
            </Button>
                {step === 1 && (
                  <Button variant="primary" size="md" disabled={saving} onClick={() => void goToStep2()}>
              Next: Add Purposes →
            </Button>
                )}
                {step === 2 && (
                  <>
                    <Button variant="secondary" size="md" disabled={saving} onClick={() => setStep(1)}>
                      ← Back
                    </Button>
                    <Button variant="primary" size="md" disabled={saving} onClick={() => void goToStep3()}>
                      Next: Preview & Publish →
                    </Button>
                  </>
                )}
                {step === 3 && (
                  <>
                    <Button variant="secondary" size="md" disabled={saving} onClick={() => setStep(2)}>
                      ← Back
                    </Button>
                    {canSubmitForReview && (
                      <Button
                        variant="primary"
                        size="md"
                        disabled={saving}
                        onClick={() => void handleSubmitForReview()}
                      >
                        Submit for Review
                      </Button>
                    )}
                    {canPublish && (
                      <Button variant="primary" size="md" disabled={saving} onClick={() => void handlePublish()}>
                        Publish Notice
                      </Button>
                    )}
                    {!canSubmitForReview && !canPublish && !isReadOnlyVersion && (
                      <span className="text-sm text-[var(--text-secondary)] self-center">
                        Awaiting approval — use the Approvals queue to proceed.
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSavedModal && (
        <Modal
          size="sm"
          title="Draft Saved"
          onClose={proceedNavigation}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Your progress has been automatically saved as a draft.
            </p>
            <div className="flex justify-end">
              <Button variant="primary" size="md" onClick={proceedNavigation}>
                Ok
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showWarningModal && (
        <Modal
          size="sm"
          title="Unsaved Changes"
          onClose={() => {
            setShowWarningModal(false);
            setPendingNavigatePage(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              {!formData.noticeTitle.trim()
                ? "A Notice Title (internal name) is required to save your progress as a draft. If you navigate away now, your changes will be lost."
                : "Failed to automatically save draft. If you navigate away now, your changes will be lost."}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                size="md"
                onClick={() => {
                  setShowWarningModal(false);
                  setPendingNavigatePage(null);
                }}
              >
                Go Back & Edit
              </Button>
              <Button variant="danger" size="md" onClick={proceedNavigation}>
                Discard Changes
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showRecoveryModal && (
        <Modal
          size="sm"
          title="Restore Draft"
          onClose={handleDiscardBackup}
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-secondary)]">
              We found an unsaved draft from your last session. Would you like to restore your progress?
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="ghost" size="md" onClick={handleDiscardBackup}>
                Discard
              </Button>
              <Button variant="primary" size="md" onClick={handleRestoreBackup}>
                Restore Draft
              </Button>
      </div>
    </div>
        </Modal>
      )}
    </ConsentManagementGate>
  );
}
