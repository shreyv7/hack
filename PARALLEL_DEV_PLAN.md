# 🤝 Vajra Health — 2-Developer Parallel Execution Plan

**Objective:** Split the implementation cleanly across 2 developers / 2 laptops with AI agents so both work concurrently with **zero merge conflicts** and a **guaranteed clean merge**.

---

## 🔀 The Split Strategy at a Glance

| Aspect | Developer 1 (Track A) | Developer 2 (Track B) |
|---|---|---|
| **Domain** | **Backend & Gemma 4 AI Gateway** | **Frontend Healthcare Experience & UI** |
| **Directory Scope** | `dpdpa_shield/backend/` ONLY | `dpdpa_shield/frontend/` ONLY |
| **Key Deliverables** | 1. Gemma 4 Client (`google-genai` SDK)<br>2. Healthcare DB Models & Schemas<br>3. Consent Policy & Redaction Engine<br>4. Break-the-Glass Handler & Proof Vault<br>5. Demo Seeder & REST Endpoints | 1. Patient Consent Portal (Toggles, Paper Upload)<br>2. Clinician Access View (Allowed vs [REDACTED])<br>3. Break-the-Glass Emergency Modal<br>4. Gemma AI Explainer & Advisor Widgets<br>5. DPO Audit & Merkle Verifier Dashboard |
| **File Overlap** | **None** | **None** |
| **Mock Mode** | Can test via Swagger `/docs` | Uses `mockHealthcareData.ts` to build UI immediately without waiting for backend |
| **Agent Prompt File** | [`TRACK_A_BACKEND_AI.md`](file:///Users/shreyvashistha/Desktop/DPDPHACK/TRACK_A_BACKEND_AI.md) | [`TRACK_B_FRONTEND_UI.md`](file:///Users/shreyvashistha/Desktop/DPDPHACK/TRACK_B_FRONTEND_UI.md) |

---

## 📡 The Shared API Contract (The Sacred Bridge)

Developer 2 can code the frontend immediately using these exact schemas and mock endpoints. Developer 1 must build endpoints matching these exact JSON payloads.

### Base URL: `/api/v1/healthcare`

#### 1. GET `/api/v1/healthcare/patients/{id}`
**Response (200 OK):**
```json
{
  "id": "p-101",
  "mrn": "MRN-2024-8842",
  "full_name": "Priya Sharma",
  "date_of_birth": "1992-06-14",
  "gender": "Female",
  "phone": "+91 98765 43210"
}
```

#### 2. GET `/api/v1/healthcare/patients/{id}/consents`
**Response (200 OK):**
```json
[
  {
    "id": "c-001",
    "purpose": "treatment",
    "status": "active",
    "allowed_categories": ["demographics", "vitals", "clinical_notes", "medications", "allergies", "surgical_history", "dental"],
    "denied_categories": ["mental_health", "reproductive", "hiv_std_status"],
    "granted_at": "2026-10-25T10:15:00Z",
    "expires_at": "2027-10-25T10:15:00Z"
  },
  {
    "id": "c-002",
    "purpose": "diagnostics",
    "status": "active",
    "allowed_categories": ["demographics", "vitals", "lab_results", "allergies"],
    "denied_categories": ["mental_health", "reproductive", "hiv_std_status", "clinical_notes"],
    "granted_at": "2026-10-25T10:15:00Z",
    "expires_at": "2027-10-25T10:15:00Z"
  }
]
```

#### 3. POST `/api/v1/healthcare/patients/{id}/consents`
**Request Body:**
```json
{
  "purpose": "treatment",
  "allowed_categories": ["demographics", "vitals", "medications", "allergies", "dental"],
  "denied_categories": ["mental_health", "reproductive", "hiv_std_status"],
  "expires_days": 365
}
```
**Response (201 Created):** Returns updated consent object.

#### 4. POST `/api/v1/healthcare/access/evaluate` (THE CORE GATEWAY)
**Request Body:**
```json
{
  "patient_id": "p-101",
  "clinician_id": "doc-402",
  "department": "Cardiology",
  "purpose": "treatment"
}
```
**Response (200 OK):**
```json
{
  "evaluation_id": "eval-8921",
  "timestamp": "2026-10-25T15:30:00Z",
  "patient_id": "p-101",
  "purpose": "treatment",
  "department": "Cardiology",
  "emergency_override": false,
  "allowed_categories": ["demographics", "vitals", "medications", "allergies"],
  "redacted_categories": ["mental_health", "reproductive", "hiv_std_status"],
  "records": [
    {
      "category": "vitals",
      "sensitivity": "standard",
      "status": "allowed",
      "data": { "bp": "120/80", "pulse": 72, "spo2": 99, "recorded_at": "2026-10-24" }
    },
    {
      "category": "medications",
      "sensitivity": "sensitive",
      "status": "allowed",
      "data": { "current": ["Metformin 500mg", "Atorvastatin 10mg"] }
    },
    {
      "category": "mental_health",
      "sensitivity": "highly_sensitive",
      "status": "redacted",
      "redaction_notice": "[REDACTED — no consent for mental_health under purpose 'treatment']",
      "data": null
    },
    {
      "category": "hiv_std_status",
      "sensitivity": "highly_sensitive",
      "status": "redacted",
      "redaction_notice": "[REDACTED — no consent for hiv_std_status under purpose 'treatment']",
      "data": null
    }
  ],
  "proof_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "block_number": 42
}
```

#### 5. POST `/api/v1/healthcare/access/break-the-glass` (EMERGENCY OVERRIDE)
**Request Body:**
```json
{
  "patient_id": "p-101",
  "clinician_id": "doc-402",
  "department": "Emergency Medicine",
  "emergency_reason": "Patient brought in unconscious with anaphylaxis; urgent allergy & medication history required for resuscitation"
}
```
**Response (200 OK):** Returns all clinical records with `emergency_override: true`, all categories `status: "allowed"`, and a high-priority Proof Vault block hash.

#### 6. POST `/api/v1/healthcare/seed-demo`
**Response (200 OK):** `{"message": "Demo patient Priya Sharma and 8 clinical records successfully initialized"}`

---

### Gemma 4 AI Endpoints: `/api/v1/healthcare/ai`

#### 7. POST `/api/v1/healthcare/ai/digitize-consent` (Multimodal)
- **Content-Type:** `multipart/form-data` (file: `image`)
- **Response (200 OK):**
```json
{
  "patient_name": "Priya Sharma",
  "mrn": "MRN-2024-8842",
  "detected_purposes": ["treatment", "diagnostics"],
  "explicitly_denied": ["mental_health", "research"],
  "has_signature": true,
  "confidence_score": 0.96,
  "summary": "Patient consents to general clinical care and blood diagnostics. Explicitly withheld mental health disclosures."
}
```

#### 8. POST `/api/v1/healthcare/ai/explain-consent`
- **Request:** `{"purpose": "treatment", "categories": ["medications", "vitals"], "language": "Hindi"}`
- **Response (200 OK):**
```json
{
  "explanation": "यह सहमति आपके डॉक्टर को आपके महत्वपूर्ण संकेत (Vitals) और वर्तमान दवाइयों की जानकारी देखने की अनुमति देती है ताकि वे आपका सही इलाज कर सकें। आपके मानसिक स्वास्थ्य से जुड़े रिकॉर्ड पूरी तरह से गोपनीय रहेंगे और डॉक्टर को नहीं दिखेंगे। आप इस सहमति को कभी भी वापस ले सकते हैं।",
  "key_points": [
    "डॉक्टर सिर्फ इलाज के लिए ज़रूरी डेटा देख सकते हैं",
    "मानसिक स्वास्थ्य डेटा पूरी तरह सुरक्षित और छिपा रहेगा",
    "आप जब चाहें ऐप से सहमति रद्द कर सकते हैं"
  ]
}
```

#### 9. POST `/api/v1/healthcare/ai/advise-access`
- **Request:** `{"patient_id": "p-101", "clinician_id": "doc-402", "query": "Can I view psychiatric evaluation notes for Priya?"}`
- **Response (200 OK):**
```json
{
  "verdict": "ACCESS_DENIED",
  "reason": "Patient Priya Sharma has explicitly not consented to 'mental_health' disclosure for purpose 'treatment'.",
  "statutory_citation": "DPDPA 2023, Section 6(1) — Processing personal data without explicit affirmative consent is prohibited.",
  "emergency_recourse": "If this is a life-threatening acute crisis, use 'Break The Glass' protocol under Section 7(a)."
}
```

#### 10. POST `/api/v1/healthcare/ai/analyze-compliance-gaps`
- **Response (200 OK):**
```json
{
  "compliance_score": 92,
  "gaps_detected": [
    {
      "severity": "LOW",
      "section": "Section 8(6)",
      "issue": "Parental verification recommended for pediatric patients under 18.",
      "remediation": "Enable guardian OTP verification flow for pediatric department."
    }
  ]
}
```

---

## 🔀 Git Branch & Merge Workflow (Zero Merge Conflicts)

### Step 1: Branch Setup
- **Developer 1 (Laptop 1):**
  ```bash
  git checkout -b feature/track-a-backend
  ```
- **Developer 2 (Laptop 2):**
  ```bash
  git checkout -b feature/track-b-frontend
  ```

### Step 2: Implementation
- Developer 1 only edits/creates in:
  - `backend/app/models/healthcare.py`
  - `backend/app/schemas/healthcare.py`
  - `backend/app/services/gemma_client.py`
  - `backend/app/services/healthcare_consent_engine.py`
  - `backend/app/services/healthcare_seed.py`
  - `backend/app/routers/healthcare.py`
  - `backend/app/routers/healthcare_ai.py`
  - `backend/app/core/config.py`
  - `backend/app/main.py`
- Developer 2 only edits/creates in:
  - `frontend/src/lib/api/healthcare.ts`
  - `frontend/src/types/healthcare.ts`
  - `frontend/src/app/healthcare/*`
  - `frontend/src/router/index.tsx`
  - `frontend/src/router/pathMap.ts`

### Step 3: Fast-Forward Merge (at ~4:30 PM)
Because there are **zero overlapping files**, merging takes 10 seconds:
```bash
# On Laptop 1 (or via GitHub PR):
git checkout main
git merge feature/track-a-backend
git merge feature/track-b-frontend
# Result: Automatic fast-forward merge with ZERO conflicts!
```
