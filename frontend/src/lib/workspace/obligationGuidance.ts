import type { DpdpObligation } from '@/types/workspace';

export interface ObligationGuidance {
  featureLabel: string;
  steps: string[];
}

/** Platform module guidance keyed by seeded obligation sort_order. */
const OBLIGATION_GUIDANCE: Record<number, ObligationGuidance> = {
  1: {
    featureLabel: 'Consent Notices Manager',
    steps: [
      'Draft or update your consent notice with required DPDPA disclosures (purpose, retention, grievance contact).',
      'Publish a new notice version so changes are versioned and auditable.',
      'Deploy the consent banner so data principals see the notice before processing begins.',
      'Export proof from Proof Vault if you need evidence of what was shown and when.',
    ],
  },
  2: {
    featureLabel: 'Purpose Registry',
    steps: [
      'Register each processing purpose with an explicit lawful basis (consent, legitimate use, or statutory).',
      'Map data categories and retention to each purpose so processing stays within scope.',
      'Link purposes to active consent notices and banner categories.',
      'Review purposes periodically and archive those no longer in use.',
    ],
  },
  3: {
    featureLabel: 'Data Rights SLA Tracker',
    steps: [
      'Configure your public data rights portal so principals can submit access, correction, and erasure requests.',
      'Track each DSAR through verification, assignment, and response within statutory timelines.',
      'Document fulfilment actions and closure evidence for audit.',
      'Monitor overdue requests from the SLA dashboard and escalate breaches of internal deadlines.',
    ],
  },
  4: {
    featureLabel: 'Security Safeguards Hub',
    steps: [
      'Document technical and organizational controls (encryption, access control, logging, deletion).',
      'Attach evidence artefacts for each control where available.',
      'Address partial or missing controls using the remediation links in each card.',
      'Generate the auditor report export when preparing for review or board reporting.',
    ],
  },
  5: {
    featureLabel: 'Breach Disclosure Wizard',
    steps: [
      'Log the incident as soon as you become aware of a personal data breach.',
      'Complete impact assessment: affected principals, data types, and special categories.',
      'Prepare and submit the Data Protection Board intimation within the 72-hour window.',
      'Notify affected data principals through configured delivery channels and retain receipts.',
    ],
  },
  6: {
    featureLabel: 'Workspace Info',
    steps: [
      'Record the Data Protection Officer name and contact email in your organization profile.',
      'Ensure DPO details flow into published consent notices and the public DSAR portal.',
      'If designated as an SDF, confirm SDF status under Industry Configuration.',
      'Export the workspace evidence pack to include DPO attestation in audit files.',
    ],
  },
  7: {
    featureLabel: 'DPIA Module',
    steps: [
      'Create a DPIA for each high-risk processing activity (new systems, large-scale profiling, sensitive data).',
      'Complete risk identification, mitigation measures, and sign-off workflow.',
      'Check out new versions when processing or controls change materially.',
      'Link DPIA outcomes to RoPA activities and security safeguard evidence.',
    ],
  },
  8: {
    featureLabel: 'Compliance Score',
    steps: [
      'Review control gaps that affect SDF audit readiness and penalty exposure.',
      'Use the breakdown to prioritize independent audit preparation areas.',
      'Recalculate the score after closing gaps in linked modules (DPIA, RoPA, safeguards).',
      'Export the compliance score PDF for third-party auditor handoff.',
    ],
  },
  9: {
    featureLabel: 'RoPA Module',
    steps: [
      'Register each processing activity with purpose, lawful basis, data categories, and retention.',
      'Document recipients, cross-border transfers, and linked DPIAs where required.',
      'Keep RoPA versions current when processing changes — check out a new version with a changelog.',
      'Export the RoPA register for regulator or auditor requests.',
    ],
  },
};

export function getObligationGuidance(obligation: DpdpObligation): ObligationGuidance | null {
  return OBLIGATION_GUIDANCE[obligation.sort_order] ?? null;
}
