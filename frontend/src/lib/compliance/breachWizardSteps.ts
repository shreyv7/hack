import type { BreachWizardData } from '@/types/compliance';

export interface StepCompletion {
  complete: boolean;
  missing: string[];
}

export interface BreachWizardStepStatus {
  step1: StepCompletion;
  step2: StepCompletion;
  step3: StepCompletion;
  step4: StepCompletion;
  allComplete: boolean;
}

export function evaluateBreachWizardSteps(wizardData: BreachWizardData): BreachWizardStepStatus {
  const step1Missing: string[] = [];
  if (!wizardData.affected_count?.trim()) {
    step1Missing.push('Affected data principals count');
  }
  if (!wizardData.mitigation_actions?.trim()) {
    step1Missing.push('Mitigation actions');
  }
  if ((wizardData.data_types ?? []).length === 0) {
    step1Missing.push('At least one affected data type');
  }

  const step2Missing: string[] = [];
  if (!wizardData.incident_summary?.trim()) {
    step2Missing.push('Incident summary for DPB');
  }
  if (!wizardData.remediation_steps?.trim()) {
    step2Missing.push('Remediation steps');
  }

  const channels = wizardData.dp_channels?.length ? wizardData.dp_channels : ['in-app'];
  const step3Missing: string[] = [];
  if (channels.length === 0) {
    step3Missing.push('Select a notification channel');
  }
  const hasSubject = Boolean(wizardData.dp_email_subject?.trim());
  const hasBody = Boolean(wizardData.dp_message_body?.trim());
  if (!hasSubject && !hasBody) {
    step3Missing.push('Notice subject or message body');
  }
  if (channels.includes('email') && !wizardData.dp_contact?.includes('@')) {
    step3Missing.push('Recipient email');
  }
  if (channels.includes('sms') && !wizardData.dp_recipient_phone?.trim()) {
    step3Missing.push('Recipient phone for SMS');
  }
  if (channels.includes('physical') && !wizardData.dp_recipient_address?.trim()) {
    step3Missing.push('Mailing address for physical mail');
  }

  const step4Missing: string[] = [];
  if (wizardData.public_disclosure_required === undefined) {
    step4Missing.push('Public disclosure requirement');
  } else if (wizardData.public_disclosure_required) {
    if (!wizardData.public_statement?.trim()) {
      step4Missing.push('Public statement');
    }
    if ((wizardData.publication_channels ?? []).length === 0) {
      step4Missing.push('Publication channel');
    }
  }

  const step1 = { complete: step1Missing.length === 0, missing: step1Missing };
  const step2 = { complete: step2Missing.length === 0, missing: step2Missing };
  const step3 = { complete: step3Missing.length === 0, missing: step3Missing };
  const step4 = { complete: step4Missing.length === 0, missing: step4Missing };

  return {
    step1,
    step2,
    step3,
    step4,
    allComplete: step1.complete && step2.complete && step3.complete && step4.complete,
  };
}
