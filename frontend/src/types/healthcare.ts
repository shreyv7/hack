export type HealthcarePurpose =
  | 'treatment'
  | 'diagnostics'
  | 'research'
  | 'insurance'
  | 'emergency'
  | 'public_health';

export type ClinicalCategory =
  | 'demographics'
  | 'vitals'
  | 'clinical_notes'
  | 'medications'
  | 'allergies'
  | 'surgical_history'
  | 'dental'
  | 'lab_results'
  | 'mental_health'
  | 'reproductive'
  | 'hiv_std_status';

export interface HealthcarePatient {
  id: string;
  mrn: string;
  full_name: string;
  date_of_birth: string;
  gender: string;
  phone: string;
}

export interface HealthcareConsent {
  id: string;
  purpose: HealthcarePurpose;
  status: 'active' | 'revoked' | 'expired';
  allowed_categories: ClinicalCategory[];
  denied_categories: ClinicalCategory[];
  granted_at: string;
  expires_at: string;
}

export interface ClinicalRecordItem {
  category: ClinicalCategory;
  sensitivity: 'standard' | 'sensitive' | 'highly_sensitive';
  status: 'allowed' | 'redacted';
  data: Record<string, unknown> | null;
  redaction_notice?: string;
}

export interface AccessDecisionResponse {
  evaluation_id: string;
  timestamp: string;
  patient_id: string;
  purpose: HealthcarePurpose;
  department: string;
  emergency_override: boolean;
  allowed_categories: ClinicalCategory[];
  redacted_categories: ClinicalCategory[];
  records: ClinicalRecordItem[];
  proof_hash: string;
  block_number: number;
}

export interface EmergencyOverrideRequest {
  patient_id: string;
  clinician_id: string;
  department: string;
  emergency_reason: string;
}

export interface AIEvaluationResponse {
  verdict: 'ACCESS_ALLOWED' | 'ACCESS_DENIED' | 'EMERGENCY_ONLY' | string;
  reason: string;
  statutory_citation: string;
  emergency_recourse: string;
}

export interface ProofVaultAuditRecord {
  id: string;
  block_number: number;
  event_type:
    | 'HEALTHCARE_ACCESS_EVALUATION'
    | 'BREAK_THE_GLASS_OVERRIDE'
    | 'EHR_CONSENT_DIGITIZATION'
    | 'CONSENT_UPDATED';
  timestamp: string;
  actor: string;
  patient_mrn: string;
  summary: string;
  proof_hash: string;
  previous_hash: string;
  priority: 'standard' | 'high';
  justification?: string;
  review_status?: 'pending' | 'approved';
}

export interface ConsentDigitizationResponse {
  patient_name: string;
  mrn: string;
  detected_purposes: HealthcarePurpose[];
  explicitly_denied: Array<ClinicalCategory | HealthcarePurpose>;
  has_signature: boolean;
  confidence_score: number;
  summary: string;
}

export interface ConsentExplanationResponse {
  explanation: string;
  key_points: string[];
}

export interface ComplianceGap {
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  section: string;
  issue: string;
  remediation: string;
}

export interface ComplianceAnalysisResponse {
  compliance_score: number;
  gaps_detected: ComplianceGap[];
}

export interface ConsentUpsertRequest {
  purpose: HealthcarePurpose;
  allowed_categories: ClinicalCategory[];
  denied_categories: ClinicalCategory[];
  expires_days: number;
}

export interface AccessEvaluationRequest {
  patient_id: string;
  clinician_id: string;
  department: string;
  purpose: HealthcarePurpose;
}
