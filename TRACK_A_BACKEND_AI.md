# 🤖 PROMPT FOR DEVELOPER 1 (LAPTOP 1) — TRACK A: BACKEND & GEMMA 4 AI

> **Instructions for Developer 1:** Copy and paste the entire block below into your AI Agent / IDE. This tracks ONLY the backend and AI services.

---

```markdown
You are an expert Backend & AI Systems Engineer working on the Hacktoberfest × MOSS Hack Day Udupi project: Vajra Health.
Your teammate is independently building the frontend in `frontend/`. 
YOU MUST ONLY CREATE AND MODIFY FILES IN `dpdpa_shield/backend/`. Do NOT touch `frontend/`.

Follow the exact API contracts specified in `PARALLEL_DEV_PLAN.md` and architecture in `SRS2.md`.

### Your Scope of Work (Track A):
1. **Config & AI Provider (`backend/app/core/config.py`):**
   - Add `GEMINI_API_KEY: str = ""` to Settings.
   - Add `GEMMA_MODEL_ID: str = "gemma-4-27b-it"`.
   - Update `AI_PROVIDER` default to `"gemma"`.

2. **Gemma 4 Client (`backend/app/services/gemma_client.py`):**
   - Import `from google import genai` and `from google.genai import types`.
   - Initialize client with `genai.Client(api_key=settings.GEMINI_API_KEY)`.
   - Implement the 6 methods with structured outputs and fallback mocks if the API key is not yet set:
     - `digitize_paper_consent(image_bytes: bytes) -> dict` (multimodal image reading)
     - `explain_consent_notice(purpose: str, categories: list[str], language: str) -> dict`
     - `advise_clinician_access(patient_id: str, clinician_id: str, query: str, active_consents: list) -> dict`
     - `analyze_compliance_gaps(policies: list) -> dict`
     - `classify_ehr_sensitivity(clinical_text: str) -> dict`
     - `generate_consent_policy(department: str) -> dict`

3. **Healthcare Database Models (`backend/app/models/healthcare.py`):**
   - Create SQLAlchemy models:
     - `HealthcarePatient`: `id`, `mrn` (unique), `full_name`, `date_of_birth`, `gender`, `phone_hash`, `consent_principal_id` (FK to `consent_principals.id`).
     - `EHRClinicalRecord`: `id`, `patient_id` (FK to `healthcare_patients.id`), `category` (string: vitals, medications, mental_health, etc.), `sensitivity_level` (standard/sensitive/highly_sensitive), `clinical_data` (JSONB), `recorded_at`.
     - `HealthcareConsent`: `id`, `patient_id` (FK), `purpose` (treatment/diagnostics/research/insurance/emergency), `allowed_categories` (JSONB), `status` (active/revoked/expired), `granted_at`, `expires_at`, `proof_record_id` (FK to `proof_vault_records.id`).
     - `AccessDecisionAudit`: `id`, `clinician_id`, `patient_id`, `purpose`, `department`, `allowed_categories` (JSONB), `redacted_categories` (JSONB), `emergency_override` (bool), `proof_hash` (string), `decision_timestamp`.
     - `EmergencyOverrideLog`: `id`, `clinician_id`, `patient_id`, `emergency_reason`, `proof_hash`, `triggered_at`, `dpo_reviewed`.

4. **Healthcare Schemas (`backend/app/schemas/healthcare.py`):**
   - Pydantic models matching the JSON contracts in `PARALLEL_DEV_PLAN.md`.

5. **Healthcare Consent Engine (`backend/app/services/healthcare_consent_engine.py`):**
   - Core method: `evaluate_access(patient_id: str, clinician_id: str, purpose: str, department: str) -> dict`:
     - Fetches active consent for `patient_id` + `purpose`.
     - Computes allowed vs denied categories.
     - Fetches clinical records for patient.
     - For allowed categories: includes `data` and `status: "allowed"`.
     - For denied categories: sets `data: null`, `status: "redacted"`, and adds `redaction_notice: "[REDACTED — no consent for {cat} under purpose '{purpose}']"`.
     - Calls `ProofVaultService` to seal an immutable SHA-256 block of this access decision.
     - Returns the payload defined in `PARALLEL_DEV_PLAN.md` endpoint #4.
   - Method: `break_the_glass(patient_id: str, clinician_id: str, department: str, reason: str) -> dict`:
     - Logs Section 7 emergency override.
     - Temporarily unlocks all categories with `emergency_override: true`.
     - Seals high-priority block in Proof Vault.

6. **Demo Seeder (`backend/app/services/healthcare_seed.py`):**
   - Seeds patient **Priya Sharma** (`MRN-2024-8842`).
   - Seeds records across 8 categories: Vitals, Medications, Allergies, Surgical History, Dental, Consult Notes, Mental Health (Anxiety notes), HIV Screening.
   - Seeds active consent for `treatment` (allows vitals, meds, allergies, dental; DENIES mental_health and hiv_std_status).

7. **Routers (`backend/app/routers/healthcare.py` and `healthcare_ai.py`):**
   - Register endpoints matching `/api/v1/healthcare/*` and `/api/v1/healthcare/ai/*`.
   - In `backend/app/main.py`: Include `healthcare.router` and `healthcare_ai.router`.

8. **Verification:**
   - Run: `python -m pytest` or run the server and test `/docs` Swagger UI.
```
