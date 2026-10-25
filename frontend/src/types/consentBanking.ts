export type AttributeLevel = 'required' | 'optional' | 'disabled';

export interface IdentifierTypeConfig {
  key: string;
  label: string;
  storage: 'token' | 'phone' | 'email';
  enabled: boolean;
  sensitive: boolean;
  allow_offline_capture: boolean;
}

export interface JourneyConfig {
  key: string;
  label: string;
  channel: string;
  attributes: Record<string, AttributeLevel>;
  otp_required?: boolean;
  allow_offline_capture?: boolean;
  staff_metadata_required?: boolean;
}

export interface ConsentIndustryConfig {
  pack?: string;
  enabled: boolean;
  identifier_types: IdentifierTypeConfig[];
  journeys: JourneyConfig[];
  property_journey_map: Record<string, string>;
}

export interface ConsentPrincipalSummary {
  id: string;
  canonical_ref: string;
  linkage_source: string;
  identifier_types: string[];
  receipt_count: number;
  last_consent_at: string | null;
  created_at: string;
}

export interface ConsentPrincipalDetail extends ConsentPrincipalSummary {
  identifiers: Array<{
    type: string;
    fingerprint: string;
    last_seen_channel: string | null;
    last_seen_at: string | null;
  }>;
  receipts: Array<{
    id: string;
    journey_key: string | null;
    capture_channel: string | null;
    language: string;
    created_at: string | null;
    consented_purposes: Record<string, boolean>;
  }>;
}
