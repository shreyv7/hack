import type { AnonymisationTechnique } from '@/types/anonymisation';
import { TECHNIQUE_LABELS } from '@/types/anonymisation';

export type TechniqueClass = 'true_anonymisation' | 'de_identification';

export const TRUE_ANONYMISATION_TECHNIQUES: AnonymisationTechnique[] = [
  'k_anonymity',
  'l_diversity',
  'suppression',
  'generalization',
];

export const DE_IDENTIFICATION_TECHNIQUES: AnonymisationTechnique[] = [
  'differential_privacy',
  'pseudonymization',
  'date_shifting',
];

export function techniqueClass(technique: AnonymisationTechnique): TechniqueClass {
  return TRUE_ANONYMISATION_TECHNIQUES.includes(technique)
    ? 'true_anonymisation'
    : 'de_identification';
}

export function techniqueClassLabel(technique: AnonymisationTechnique): string {
  return techniqueClass(technique) === 'true_anonymisation'
    ? 'Irreversible anonymisation'
    : 'De-identification (may remain personal data)';
}

export function isTrueAnonymisation(technique: AnonymisationTechnique): boolean {
  return techniqueClass(technique) === 'true_anonymisation';
}

export const TECHNIQUE_GROUPS: { label: string; hint: string; techniques: AnonymisationTechnique[] }[] = [
  {
    label: 'Irreversible anonymisation (recommended for analytics export)',
    hint: 'Output is intended to fall outside DPDPA personal-data scope when correctly applied.',
    techniques: TRUE_ANONYMISATION_TECHNIQUES,
  },
  {
    label: 'De-identification techniques (use with legal review)',
    hint: 'Pseudonymization, date shifting, and DP noise may still be personal data under DPDPA.',
    techniques: DE_IDENTIFICATION_TECHNIQUES,
  },
];

export function techniqueOptionLabel(technique: AnonymisationTechnique): string {
  const base = TECHNIQUE_LABELS[technique];
  return isTrueAnonymisation(technique) ? `${base} — irreversible` : `${base} — de-identification`;
}
