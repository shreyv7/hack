export interface BannerPurposeOption {
  id: string;
  label: string;
  description: string;
}

/** Internal banner-purpose options (not shown on the public CMP widget). */
export const BANNER_PURPOSE_OPTIONS: BannerPurposeOption[] = [
  {
    id: 'cookie',
    label: 'Cookie Consent',
    description: 'Cookies, trackers, pixels per DPDPA Sec 5',
  },
  {
    id: 'marketing',
    label: 'Marketing Consent',
    description: 'Email, SMS, push',
  },
  {
    id: 'profiling',
    label: 'Profiling Consent',
    description: 'Personalization, behavioral analytics',
  },
  {
    id: 'general',
    label: 'General Privacy Notice',
    description: 'Generic data collection notice',
  },
  {
    id: 'children',
    label: "Children's Data",
    description: 'Minor data, verifiable parental consent',
  },
  {
    id: 'location',
    label: 'Location / GPS',
    description: 'Geolocation, maps, proximity tracking',
  },
  {
    id: 'biometric',
    label: 'Biometric',
    description: 'Fingerprint, face, voice recognition',
  },
  {
    id: 'health',
    label: 'Health & Sensitive Data',
    description: 'Medical, health records, special categories',
  },
  {
    id: 'analytics',
    label: 'Analytics & Performance',
    description: 'Site/app analytics, performance monitoring',
  },
  {
    id: 'third_party',
    label: 'Third-Party Sharing',
    description: 'Vendors, ad partners, data processors',
  },
  {
    id: 'employment',
    label: 'Employment / HR',
    description: 'Employee, contractor, applicant data',
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Describe a purpose not listed above',
  },
];

const PURPOSE_LABEL_BY_ID = Object.fromEntries(
  BANNER_PURPOSE_OPTIONS.map((p) => [p.id, p.label]),
) as Record<string, string>;

/** Resolve stored purpose IDs to human-readable labels. */
export function getBannerPurposeLabels(
  purposeTypes: string[] | undefined | null,
  customText?: string | null,
): string[] {
  if (!purposeTypes?.length) return [];

  return purposeTypes.map((id) => {
    if (id === 'custom' && customText?.trim()) {
      return customText.trim();
    }
    return PURPOSE_LABEL_BY_ID[id] ?? id;
  });
}
