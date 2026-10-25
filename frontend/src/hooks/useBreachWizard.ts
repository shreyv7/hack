import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError } from '@/lib/api/client';
import * as complianceApi from '@/lib/api/compliance';
import {
  clearLocalBreachWizardDraft,
  deadlineRemainingSeconds,
  loadLocalBreachWizardDraft,
  newLocalBreachWizardDraft,
  saveLocalBreachWizardDraft,
  type LocalBreachWizardDraft,
} from '@/lib/compliance/breachWizardDraft';
import { useComplianceOrg } from '@/hooks/useComplianceOrg';
import type { BreachIncident, BreachWizardData } from '@/types/compliance';

export function useBreachWizard() {
  const { incidentId } = useParams<{ incidentId?: string }>();
  const org = useComplianceOrg();
  const isNewDraft = incidentId === 'new';
  const [incident, setIncident] = useState<BreachIncident | null>(null);
  const [localDraft, setLocalDraft] = useState<LocalBreachWizardDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org.hasOrg) {
      setIncident(null);
      setLocalDraft(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isNewDraft) {
        const saved = loadLocalBreachWizardDraft(org.orgIdParam) ?? newLocalBreachWizardDraft();
        setLocalDraft(saved);
        setIncident(null);
        return;
      }
      if (incidentId) {
        const row = await complianceApi.fetchBreachIncident(incidentId, org.orgIdParam);
        setIncident(row);
        setLocalDraft(null);
        return;
      }
      setIncident(null);
      setLocalDraft(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load breach incident');
      setIncident(null);
      setLocalDraft(null);
    } finally {
      setLoading(false);
    }
  }, [org.hasOrg, org.orgIdParam, incidentId, isNewDraft]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveDraft = useCallback(
    async (currentStep: number, severity: string, wizardData: BreachWizardData) => {
      if (isNewDraft) {
        const draft: LocalBreachWizardDraft = {
          wizardData,
          severity,
          currentStep,
          startedAt: localDraft?.startedAt ?? new Date().toISOString(),
        };
        saveLocalBreachWizardDraft(draft, org.orgIdParam);
        setLocalDraft(draft);
        return null;
      }
      if (!incident) return null;
      const updated = await complianceApi.updateBreachIncident(
        incident.id,
        { current_step: currentStep, severity: severity.toLowerCase(), wizard_data: wizardData },
        org.orgIdParam,
      );
      setIncident(updated);
      return updated;
    },
    [incident, isNewDraft, localDraft?.startedAt, org.orgIdParam],
  );

  const submitPackage = useCallback(
    async (currentStep: number, severity: string, wizardData: BreachWizardData) => {
      let active = incident;
      if (isNewDraft || !active) {
        active = await complianceApi.createBreachIncident(
          { severity: severity.toLowerCase(), wizard_data: wizardData },
          org.orgIdParam,
        );
        active = await complianceApi.updateBreachIncident(
          active.id,
          { current_step: currentStep, severity: severity.toLowerCase(), wizard_data: wizardData },
          org.orgIdParam,
        );
        clearLocalBreachWizardDraft(org.orgIdParam);
        setLocalDraft(null);
      } else {
        active = await complianceApi.updateBreachIncident(
          active.id,
          { current_step: currentStep, severity: severity.toLowerCase(), wizard_data: wizardData },
          org.orgIdParam,
        );
      }
      setIncident(active);
      await complianceApi.notifyBreachDpb(active.id, org.orgIdParam);
      await complianceApi.notifyBreachPrincipals(active.id, org.orgIdParam);
      const submitted = await complianceApi.submitBreachIncident(active.id, org.orgIdParam);
      setIncident(submitted);
      return submitted;
    },
    [incident, isNewDraft, org.orgIdParam],
  );

  const deadlineRemaining = isNewDraft
    ? deadlineRemainingSeconds(localDraft?.startedAt ?? new Date().toISOString())
    : incident?.deadline_remaining_seconds ?? 0;

  return {
    ...org,
    incident,
    localDraft,
    isNewDraft,
    deadlineRemaining,
    loading,
    error,
    reload: load,
    saveDraft,
    submitPackage,
    setIncident,
  };
}
