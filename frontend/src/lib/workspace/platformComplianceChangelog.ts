export const PLATFORM_COMPLIANCE_VERSION = 'DPDPA 2023 Compliant v4.2';
export const PLATFORM_COMPLIANCE_SUBTITLE = 'DPB Rules Mar 2025 incorporated';

export interface PlatformChangelogEntry {
  version: string;
  date: string;
  title: string;
  items: string[];
}

/** Product-level DPDPA adoption history for the ZeroShield platform. */
export const PLATFORM_COMPLIANCE_CHANGELOG: PlatformChangelogEntry[] = [
  {
    version: 'v4.2',
    date: 'March 2025',
    title: 'DPB Rules March 2025 Update',
    items: [
      'Updated breach notification timelines to 72 hours',
      'Enhanced consent withdrawal mechanisms',
      'Added new data principal rights request templates',
      'Implemented additional security safeguards',
    ],
  },
  {
    version: 'v4.1',
    date: 'January 2025',
    title: 'DPDPA 2023 Act Compliance',
    items: [
      'Full implementation of DPDPA 2023 requirements',
      'RoPA and DPIA modules integrated',
      'Significant Data Fiduciary classification support',
    ],
  },
  {
    version: 'v4.0',
    date: 'September 2024',
    title: 'Shield AI Launch',
    items: [
      'Introduced Shield AI assistant',
      'Automated compliance suggestions',
      'Smart risk detection algorithms',
    ],
  },
];
