import { ApiError, apiFetch } from '@/lib/api/client';
import type {
  AccessDecisionResponse,
  AccessEvaluationRequest,
  AIEvaluationResponse,
  ClinicalCategory,
  ClinicalRecordItem,
  ComplianceAnalysisResponse,
  ConsentDigitizationResponse,
  ConsentExplanationResponse,
  ConsentUpsertRequest,
  EmergencyOverrideRequest,
  HealthcareConsent,
  HealthcarePatient,
  HealthcarePurpose,
  ProofVaultAuditRecord,
} from '@/types/healthcare';

const HEALTHCARE_BASE = '/v1/healthcare';
const MOCK_DELAY_MS = 280;
const BREAK_GLASS_STORAGE_KEY = 'vajra-health-break-glass-events';

/** Mock mode is on by default for independent Track B development. Set VITE_USE_HEALTHCARE_MOCKS=false to use the backend. */
export const USE_MOCK_DATA = import.meta.env.VITE_USE_HEALTHCARE_MOCKS !== 'false';

export const MOCK_PATIENT: HealthcarePatient = {
  id: 'p-101',
  mrn: 'MRN-2024-8842',
  full_name: 'Priya Sharma',
  date_of_birth: '1992-06-14',
  gender: 'Female',
  phone: '+91 98765 43210',
};

const standardAllowed: ClinicalCategory[] = [
  'demographics',
  'vitals',
  'clinical_notes',
  'medications',
  'allergies',
  'surgical_history',
  'dental',
];
const protectedCategories: ClinicalCategory[] = ['mental_health', 'reproductive', 'hiv_std_status'];

export const MOCK_CONSENTS: HealthcareConsent[] = [
  {
    id: 'c-001',
    purpose: 'treatment',
    status: 'active',
    allowed_categories: standardAllowed,
    denied_categories: protectedCategories,
    granted_at: '2026-10-25T10:15:00Z',
    expires_at: '2027-10-25T10:15:00Z',
  },
  {
    id: 'c-002',
    purpose: 'diagnostics',
    status: 'active',
    allowed_categories: ['demographics', 'vitals', 'lab_results', 'allergies'],
    denied_categories: ['mental_health', 'reproductive', 'hiv_std_status', 'clinical_notes'],
    granted_at: '2026-10-25T10:15:00Z',
    expires_at: '2027-10-25T10:15:00Z',
  },
  {
    id: 'c-003',
    purpose: 'research',
    status: 'revoked',
    allowed_categories: ['demographics'],
    denied_categories: ['clinical_notes', 'mental_health', 'reproductive', 'hiv_std_status'],
    granted_at: '2026-08-12T08:00:00Z',
    expires_at: '2026-10-24T08:00:00Z',
  },
  {
    id: 'c-004',
    purpose: 'insurance',
    status: 'active',
    allowed_categories: ['demographics', 'vitals', 'medications'],
    denied_categories: ['mental_health', 'reproductive', 'hiv_std_status', 'clinical_notes'],
    granted_at: '2026-10-25T10:15:00Z',
    expires_at: '2027-04-25T10:15:00Z',
  },
  {
    id: 'c-005',
    purpose: 'emergency',
    status: 'active',
    allowed_categories: [...standardAllowed, 'lab_results', ...protectedCategories],
    denied_categories: [],
    granted_at: '2026-10-25T10:15:00Z',
    expires_at: '2027-10-25T10:15:00Z',
  },
];

const allowedRecords: ClinicalRecordItem[] = [
  {
    category: 'vitals',
    sensitivity: 'standard',
    status: 'allowed',
    data: { bp: '120/80', pulse: 72, spo2: '99%', temperature: '98.4°F', recorded_at: '2026-10-24' },
  },
  {
    category: 'medications',
    sensitivity: 'sensitive',
    status: 'allowed',
    data: { current: ['Metformin 500mg · twice daily', 'Atorvastatin 10mg · nightly'] },
  },
  {
    category: 'allergies',
    sensitivity: 'sensitive',
    status: 'allowed',
    data: { confirmed: ['Penicillin · severe'], last_reviewed: '2026-09-12' },
  },
  {
    category: 'clinical_notes',
    sensitivity: 'sensitive',
    status: 'allowed',
    data: { latest: 'Type 2 diabetes stable. Continue current medication and repeat HbA1c in 12 weeks.' },
  },
];

const redactedRecords: ClinicalRecordItem[] = protectedCategories.map((category) => ({
  category,
  sensitivity: 'highly_sensitive',
  status: 'redacted',
  redaction_notice: `[REDACTED — no consent for ${category} under purpose 'treatment']`,
  data: null,
}));

export const MOCK_ACCESS_DECISION: AccessDecisionResponse = {
  evaluation_id: 'eval-8921',
  timestamp: '2026-10-25T15:30:00Z',
  patient_id: MOCK_PATIENT.id,
  purpose: 'treatment',
  department: 'Cardiology',
  emergency_override: false,
  allowed_categories: allowedRecords.map((record) => record.category),
  redacted_categories: protectedCategories,
  records: [...allowedRecords, ...redactedRecords],
  proof_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  block_number: 42,
};

const baseAuditRecords: ProofVaultAuditRecord[] = [
  {
    id: 'audit-45',
    block_number: 45,
    event_type: 'EHR_CONSENT_DIGITIZATION',
    timestamp: '2026-10-25T16:20:11Z',
    actor: 'Gemma 4 Vision Gateway',
    patient_mrn: MOCK_PATIENT.mrn,
    summary: 'Paper consent digitized with 96% confidence and patient confirmation.',
    proof_hash: '6fe02b81f347bdbd13e36edb978bad2aa42ef162c56fd5d326ea4c45bb84fb6b',
    previous_hash: 'af72b79e97f949775a7c5e9cd2698a9f5a4d769f04ebbf35b5df92838c3d3325',
    priority: 'standard',
  },
  {
    id: 'audit-44',
    block_number: 44,
    event_type: 'BREAK_THE_GLASS_OVERRIDE',
    timestamp: '2026-10-25T16:02:48Z',
    actor: 'Dr. Arjun Rao · Emergency Medicine',
    patient_mrn: MOCK_PATIENT.mrn,
    summary: 'Emergency access opened for all protected clinical categories.',
    proof_hash: 'af72b79e97f949775a7c5e9cd2698a9f5a4d769f04ebbf35b5df92838c3d3325',
    previous_hash: '42ad8b538fa4f55f5bf715b812678959438a39131cf2e712871e52cda2c7cb57',
    priority: 'high',
    justification: 'Patient unconscious with suspected anaphylaxis; complete history required for safe resuscitation.',
    review_status: 'pending',
  },
  {
    id: 'audit-43',
    block_number: 43,
    event_type: 'CONSENT_UPDATED',
    timestamp: '2026-10-25T15:42:16Z',
    actor: 'Priya Sharma · Patient Portal',
    patient_mrn: MOCK_PATIENT.mrn,
    summary: 'Treatment consent updated; mental health and reproductive records withheld.',
    proof_hash: '42ad8b538fa4f55f5bf715b812678959438a39131cf2e712871e52cda2c7cb57',
    previous_hash: MOCK_ACCESS_DECISION.proof_hash,
    priority: 'standard',
  },
  {
    id: 'audit-42',
    block_number: 42,
    event_type: 'HEALTHCARE_ACCESS_EVALUATION',
    timestamp: MOCK_ACCESS_DECISION.timestamp,
    actor: 'Dr. Arjun Rao · Cardiology',
    patient_mrn: MOCK_PATIENT.mrn,
    summary: '4 categories allowed; 3 highly sensitive categories redacted.',
    proof_hash: MOCK_ACCESS_DECISION.proof_hash,
    previous_hash: '0000000000000000000000000000000000000000000000000000000000000000',
    priority: 'standard',
  },
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function mockResult<T>(value: T): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, MOCK_DELAY_MS));
  return clone(value);
}

async function withMockFallback<T>(request: () => Promise<T>, mockFactory: () => Promise<T>): Promise<T> {
  if (USE_MOCK_DATA) return mockFactory();
  try {
    return await request();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) {
      console.info('[Vajra Health] Backend unavailable; using local healthcare mock data.');
      return mockFactory();
    }
    throw error;
  }
}

function readStoredBreakGlassEvents(): ProofVaultAuditRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(BREAK_GLASS_STORAGE_KEY) ?? '[]') as ProofVaultAuditRecord[];
  } catch {
    return [];
  }
}

function writeBreakGlassEvent(event: ProofVaultAuditRecord): void {
  const current = readStoredBreakGlassEvents().filter((item) => item.id !== event.id);
  window.localStorage.setItem(BREAK_GLASS_STORAGE_KEY, JSON.stringify([event, ...current].slice(0, 8)));
}

export function getHealthcarePatient(patientId: string): Promise<HealthcarePatient> {
  return withMockFallback(
    () => apiFetch<HealthcarePatient>(`${HEALTHCARE_BASE}/patients/${patientId}`),
    () => mockResult(MOCK_PATIENT),
  );
}

export function getHealthcareConsents(patientId: string): Promise<HealthcareConsent[]> {
  return withMockFallback(
    () => apiFetch<HealthcareConsent[]>(`${HEALTHCARE_BASE}/patients/${patientId}/consents`),
    () => mockResult(MOCK_CONSENTS),
  );
}

export function saveHealthcareConsent(patientId: string, payload: ConsentUpsertRequest): Promise<HealthcareConsent> {
  return withMockFallback(
    () => apiFetch<HealthcareConsent>(`${HEALTHCARE_BASE}/patients/${patientId}/consents`, { method: 'POST', body: JSON.stringify(payload) }),
    () => mockResult({
      id: `c-${payload.purpose}`,
      ...payload,
      status: 'active' as const,
      granted_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + payload.expires_days * 86_400_000).toISOString(),
    }),
  );
}

export function evaluateHealthcareAccess(payload: AccessEvaluationRequest): Promise<AccessDecisionResponse> {
  return withMockFallback(
    () => apiFetch<AccessDecisionResponse>(`${HEALTHCARE_BASE}/access/evaluate`, { method: 'POST', body: JSON.stringify(payload) }),
    () => mockResult({ ...MOCK_ACCESS_DECISION, department: payload.department, purpose: payload.purpose }),
  );
}

export function breakTheGlass(payload: EmergencyOverrideRequest): Promise<AccessDecisionResponse> {
  return withMockFallback(
    () => apiFetch<AccessDecisionResponse>(`${HEALTHCARE_BASE}/access/break-the-glass`, { method: 'POST', body: JSON.stringify(payload) }),
    async () => {
      const timestamp = new Date().toISOString();
      const proofHash = '99d8dbe62f8592227d34a3f404edc21498db164a04dd9767b819472278a7cf31';
      const records = MOCK_ACCESS_DECISION.records.map((record) => ({
        ...record,
        status: 'allowed' as const,
        redaction_notice: undefined,
        data: record.data ?? {
          emergency_disclosure: 'Protected clinical details revealed only for this emergency session.',
          access_scope: record.category,
        },
      }));
      const decision: AccessDecisionResponse = {
        ...MOCK_ACCESS_DECISION,
        evaluation_id: 'override-8944',
        timestamp,
        department: payload.department,
        emergency_override: true,
        allowed_categories: records.map((record) => record.category),
        redacted_categories: [],
        records,
        proof_hash: proofHash,
        block_number: 46,
      };
      writeBreakGlassEvent({
        id: `audit-${Date.now()}`,
        block_number: 46,
        event_type: 'BREAK_THE_GLASS_OVERRIDE',
        timestamp,
        actor: 'Dr. Arjun Rao · Clinician View',
        patient_mrn: MOCK_PATIENT.mrn,
        summary: 'Emergency override revealed protected records for the active clinical session.',
        proof_hash: proofHash,
        previous_hash: baseAuditRecords[0].proof_hash,
        priority: 'high',
        justification: payload.emergency_reason,
        review_status: 'pending',
      });
      return mockResult(decision);
    },
  );
}

export function seedHealthcareDemo(): Promise<{ message: string }> {
  return withMockFallback(
    () => apiFetch<{ message: string }>(`${HEALTHCARE_BASE}/seed-demo`, { method: 'POST' }),
    () => mockResult({ message: 'Demo patient Priya Sharma and 8 clinical records successfully initialized' }),
  );
}

export function digitizeConsent(image: File): Promise<ConsentDigitizationResponse> {
  const formData = new FormData();
  formData.append('image', image);
  return withMockFallback(
    () => apiFetch<ConsentDigitizationResponse>(`${HEALTHCARE_BASE}/ai/digitize-consent`, { method: 'POST', body: formData }),
    () => mockResult({
      patient_name: 'Priya Sharma',
      mrn: 'MRN-2024-8842',
      detected_purposes: ['treatment', 'diagnostics'],
      explicitly_denied: ['mental_health', 'research'],
      has_signature: true,
      confidence_score: 0.96,
      summary: 'Patient consents to general clinical care and blood diagnostics. Explicitly withheld mental health disclosures.',
    }),
  );
}

export function explainConsent(payload: { purpose: HealthcarePurpose; categories: ClinicalCategory[]; language: string }): Promise<ConsentExplanationResponse> {
  const localized: Record<string, ConsentExplanationResponse> = {
    Hindi: {
      explanation: 'यह सहमति आपके डॉक्टर को सही इलाज के लिए केवल ज़रूरी स्वास्थ्य जानकारी देखने देती है। संवेदनशील रिकॉर्ड निजी रहेंगे।',
      key_points: ['डॉक्टर सिर्फ इलाज के लिए ज़रूरी डेटा देख सकते हैं', 'मानसिक स्वास्थ्य डेटा पूरी तरह सुरक्षित और छिपा रहेगा', 'आप कभी भी अपनी सहमति बदल या वापस ले सकती हैं'],
    },
    Kannada: {
      explanation: 'ಈ ಸಮ್ಮತಿಯು ಸರಿಯಾದ ಚಿಕಿತ್ಸೆಗೆ ಅಗತ್ಯವಿರುವ ಆರೋಗ್ಯ ಮಾಹಿತಿಯನ್ನು ಮಾತ್ರ ವೈದ್ಯರು ನೋಡಲು ಅನುಮತಿಸುತ್ತದೆ.',
      key_points: ['ವೈದ್ಯರು ಚಿಕಿತ್ಸೆಗೆ ಅಗತ್ಯವಿರುವ ಮಾಹಿತಿಯನ್ನು ಮಾತ್ರ ನೋಡಬಹುದು', 'ಮಾನಸಿಕ ಆರೋಗ್ಯದ ದಾಖಲೆಗಳು ಖಾಸಗಿಯಾಗಿರುತ್ತವೆ', 'ನೀವು ಯಾವಾಗ ಬೇಕಾದರೂ ಸಮ್ಮತಿಯನ್ನು ಹಿಂಪಡೆಯಬಹುದು'],
    },
    Tamil: {
      explanation: 'சரியான சிகிச்சைக்குத் தேவையான உடல்நலத் தகவல்களை மட்டும் மருத்துவர் பார்க்க இந்த ஒப்புதல் அனுமதிக்கிறது.',
      key_points: ['சிகிச்சைக்குத் தேவையான தரவு மட்டும் பகிரப்படும்', 'மனநலப் பதிவுகள் தனிப்பட்டதாக இருக்கும்', 'எப்போது வேண்டுமானாலும் ஒப்புதலைத் திரும்பப் பெறலாம்'],
    },
    English: {
      explanation: 'This consent lets your care team see only the health information needed for your treatment. Sensitive records stay private.',
      key_points: ['Only treatment-relevant data is shared', 'Mental health and reproductive records remain hidden', 'You can change or withdraw consent at any time'],
    },
  };
  return withMockFallback(
    () => apiFetch<ConsentExplanationResponse>(`${HEALTHCARE_BASE}/ai/explain-consent`, { method: 'POST', body: JSON.stringify(payload) }),
    () => mockResult(localized[payload.language] ?? localized.English),
  );
}

export function adviseHealthcareAccess(payload: { patient_id: string; clinician_id: string; query: string }): Promise<AIEvaluationResponse> {
  return withMockFallback(
    () => apiFetch<AIEvaluationResponse>(`${HEALTHCARE_BASE}/ai/advise-access`, { method: 'POST', body: JSON.stringify(payload) }),
    () => mockResult({
      verdict: 'ACCESS_DENIED',
      reason: "Priya Sharma has explicitly not consented to 'mental_health' disclosure for purpose 'treatment'.",
      statutory_citation: 'DPDPA 2023, Section 6(1) — Processing personal data without explicit affirmative consent is prohibited.',
      emergency_recourse: "If this is a life-threatening acute crisis, use 'Break The Glass' under Section 7(a).",
    }),
  );
}

export function analyzeHealthcareCompliance(): Promise<ComplianceAnalysisResponse> {
  return withMockFallback(
    () => apiFetch<ComplianceAnalysisResponse>(`${HEALTHCARE_BASE}/ai/analyze-compliance-gaps`, { method: 'POST' }),
    () => mockResult({
      compliance_score: 94,
      gaps_detected: [{
        severity: 'LOW',
        section: 'Section 8(6)',
        issue: 'Guardian verification should be expanded for pediatric workflows.',
        remediation: 'Enable guardian OTP verification for pediatric departments.',
      }],
    }),
  );
}

export function getProofVaultAuditRecords(): Promise<ProofVaultAuditRecord[]> {
  return withMockFallback(
    () => apiFetch<ProofVaultAuditRecord[]>(`${HEALTHCARE_BASE}/audit`),
    () => mockResult([...readStoredBreakGlassEvents(), ...baseAuditRecords]),
  );
}

export function approveEmergencyOverride(recordId: string): Promise<{ status: 'approved' }> {
  return withMockFallback(
    () => apiFetch<{ status: 'approved' }>(`${HEALTHCARE_BASE}/audit/${recordId}/approve`, { method: 'POST' }),
    () => mockResult({ status: 'approved' }),
  );
}

export function purposeLabel(purpose: HealthcarePurpose): string {
  return purpose.replace(/_/g, ' ').replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}
