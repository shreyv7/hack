import type { BreachWizardData } from '@/types/compliance';

export interface LocalBreachWizardDraft {
  wizardData: BreachWizardData;
  severity: string;
  currentStep: number;
  startedAt: string;
}

function storageKey(orgId?: string): string {
  return `breach-wizard-new-${orgId ?? 'default'}`;
}

export function loadLocalBreachWizardDraft(orgId?: string): LocalBreachWizardDraft | null {
  try {
    const raw = sessionStorage.getItem(storageKey(orgId));
    if (!raw) return null;
    return JSON.parse(raw) as LocalBreachWizardDraft;
  } catch {
    return null;
  }
}

export function saveLocalBreachWizardDraft(
  draft: LocalBreachWizardDraft,
  orgId?: string,
): void {
  sessionStorage.setItem(storageKey(orgId), JSON.stringify(draft));
}

export function clearLocalBreachWizardDraft(orgId?: string): void {
  sessionStorage.removeItem(storageKey(orgId));
}

export function newLocalBreachWizardDraft(): LocalBreachWizardDraft {
  return {
    wizardData: {},
    severity: 'high',
    currentStep: 1,
    startedAt: new Date().toISOString(),
  };
}

export function deadlineRemainingSeconds(startedAt: string): number {
  const start = new Date(startedAt).getTime();
  const deadline = start + 72 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
}
