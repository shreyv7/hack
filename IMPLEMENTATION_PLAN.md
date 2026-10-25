# 🏥 Open-DPDPA HealthShield — Implementation Plan

**Hackathon:** Hacktoberfest × MOSS Hack Day Udupi (Sunday, 25 October 2026, 9:00 AM – 7:30 PM IST)  
**Challenges:** 🏆 Best Open-Source AI Project + 🏆 Best Use of Gemma 4  
**Base Repository:** [dpdpa_shield](file:///Users/shreyvashistha/Desktop/DPDPHACK/dpdpa_shield)  
**SRS Reference:** [SRS2.md](file:///Users/shreyvashistha/Desktop/DPDPHACK/SRS2.md)  
**Parallel Execution Guide:** [PARALLEL_DEV_PLAN.md](file:///Users/shreyvashistha/Desktop/DPDPHACK/PARALLEL_DEV_PLAN.md)  
**Track Prompts:** [TRACK_A_BACKEND_AI.md](file:///Users/shreyvashistha/Desktop/DPDPHACK/TRACK_A_BACKEND_AI.md) | [TRACK_B_FRONTEND_UI.md](file:///Users/shreyvashistha/Desktop/DPDPHACK/TRACK_B_FRONTEND_UI.md)  
**Submission Deadline:** **5:00 PM IST sharp**

---

## 🎯 Architecture Summary (Post Grill-Me Consensus)

1. **AI Engine:** Gemma 4 (`gemma-4-27b-it` / `gemma-4-12b-it`) accessed through the Gemini API using the `google-genai` SDK.
2. **AI Capabilities (All 6 Included):**
   - 📸 **Multimodal Paper Consent Form Digitizer:** Physical form photo $\rightarrow$ structured FHIR consent JSON.
   - 🌐 **Multilingual Patient Explainer:** Legal notice $\rightarrow$ plain-language explanation in 8 Indian languages (Hindi, English, etc.).
   - 🩺 **Clinician Access Advisor:** Real-time conversational assistant answering access queries citing DPDPA 2023 sections.
   - 🔍 **DPDPA Compliance Gap Analyzer:** Hospital policy risk & penalty audit against DPDPA rules.
   - 🏷️ **EHR PII & Sensitivity Auto-Classifier:** Scans records into Standard, Sensitive, and Highly Sensitive tiers.
   - 📜 **Healthcare Consent Policy Generator:** Tailors compliant consent notices per clinical specialty.
3. **Domain Scope:** **Universal Healthcare Institutions** (supports all departments: Cardiology, Oncology, Psychiatry, Emergency Medicine, Surgery, Orthopedics, Pediatrics, General Medicine, Dentistry, Pathology).
4. **EHR Data Model:** Lightweight, pragmatic FHIR R4-aligned schema (`Patient`, `Observation`, `Condition`, `MedicationStatement`, `Encounter`).
5. **Consent Granularity:** **Purpose-based** (`treatment`, `diagnostics`, `research`, `insurance`, `emergency`, `public_health`).
6. **Enforcement UX:** **Deterministic Visual Redaction** — unconsented fields render as high-visibility red `[REDACTED — no consent for {purpose}]` cards.
7. **Emergency Protocol:** **Break-the-Glass (BTG)** under DPDPA Section 7 with mandatory justification, ephemeral 30-min access, high-priority audit flagging, and immutable Proof Vault sealing.
8. **Component Reuse from `dpdpa_shield`:**
   - `ProofVaultRecord` & `ProofVaultService` (SHA-256 block-chained tamper-evident ledger)
   - `ConsentPrincipal` & Consent lifecycle state machine
   - `AnonymisationService` (PII masking algorithms)
   - `ComplianceService` (DPDPA compliance ratings)
   - Frontend dark-mode glassmorphic design system and UI components

---

## 🏗️ Implementation Phases & Execution Roadmap

### Phase 1: Core AI & Configuration (Backend)
- [ ] Add `GEMINI_API_KEY` and `GEMMA_MODEL_ID` (`gemma-4-27b-it`) to `dpdpa_shield/backend/app/core/config.py`.
- [ ] Create `dpdpa_shield/backend/app/services/gemma_client.py`:
  - Direct integration with `google.genai` SDK using `gemini_api_key`.
  - Implements the 6 Gemma 4 functions with structured JSON parsing and robust error fallbacks.

### Phase 2: Healthcare Backend & Consent Engine (Backend)
- [ ] Create `dpdpa_shield/backend/app/models/healthcare.py`:
  - `HealthcarePatient` (MRN, DOB, gender, links to `ConsentPrincipal`).
  - `EHRClinicalRecord` (category, sensitivity tier, FHIR-aligned payload).
  - `HealthcareConsent` (purpose, allowed categories, validity).
  - `AccessDecisionAudit` (clinician, patient, purpose, allowed/redacted, proof hash).
  - `EmergencyOverrideLog` (clinician, reason, clinical context, sealed block hash).
- [ ] Create `dpdpa_shield/backend/app/schemas/healthcare.py` matching the shared API contract.
- [ ] Create `dpdpa_shield/backend/app/services/healthcare_consent_engine.py`:
  - Deterministic purpose evaluation against active patient consents.
  - Generates redacted payload with `[REDACTED — no consent for {purpose}]`.
  - Interfaces with `ProofVaultService` to seal SHA-256 block on every decision.
- [ ] Create `dpdpa_shield/backend/app/routers/healthcare.py` and `healthcare_ai.py`.
- [ ] Register routers in `dpdpa_shield/backend/app/main.py`.

### Phase 3: Demo Data Seeder (Backend)
- [ ] Create `dpdpa_shield/backend/app/services/healthcare_seed.py` with multi-category demo patient:
  - Name: **Priya Sharma** (MRN: `MRN-2024-8842`)
  - Records across 8 categories: General Consult, Vitals, Medications, Allergies, Surgical History, Dental Chart, Mental Health (Anxiety/Depression therapy notes), HIV/STD screening.
  - Active consent: `treatment` allowed for General Medicine, Vitals, Medications, Allergies; `mental_health` and `hiv_std_status` explicitly denied.

### Phase 4: Frontend Healthcare Experience (Frontend)
- [ ] Create `dpdpa_shield/frontend/src/types/healthcare.ts` & `lib/api/healthcare.ts` (with offline mock fallback).
- [ ] Create `dpdpa_shield/frontend/src/app/healthcare/`:
  - **`PatientConsentPortal.tsx`**: Granular purpose cards, category chips, Gemma multilingual explainer, and paper form upload.
  - **`ClinicianAccessView.tsx`**: Department & purpose selectors, split view (Allowed Green cards vs Redacted Red cards), Gemma Clinician Advisor chat, and Break the Glass emergency modal.
  - **`HealthcareAuditDashboard.tsx`**: Real-time cryptographic ledger with Proof Vault hash chain, Merkle verification button, and emergency override review list.
- [ ] Register routes in `dpdpa_shield/frontend/src/router/index.tsx` and sidebar in `pathMap.ts`.

### Phase 5: Fast-Forward Git Merge & Hackathon Submission
- [ ] Merge `feature/track-a-backend` and `feature/track-b-frontend` into `main` (0 merge conflicts).
- [ ] Verify end-to-end flow: Paper Upload $\rightarrow$ Patient Grant $\rightarrow$ Clinician View (Redacted) $\rightarrow$ Gemma Advisor $\rightarrow$ Break the Glass $\rightarrow$ Proof Vault Audit.
- [ ] Finalize submission `README.md` fulfilling all Hackathon PDF requirements:
  - Project description & architectural diagrams.
  - Team members.
  - MIT License.
  - Open-weight Gemma 4 model link and Gemini API integration explanation.
  - AI tools credited (`Antigravity IDE`).
  - Open-source base repo attribution (`dpdpa_shield`).
  - Quickstart run instructions.
- [ ] Submit on **OrganizerHQ Challenges** before 5:00 PM IST sharp!
