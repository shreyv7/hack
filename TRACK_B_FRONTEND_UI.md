# 🎨 PROMPT FOR DEVELOPER 2 (LAPTOP 2) — TRACK B: FRONTEND & HEALTHCARE UI/UX

> **Instructions for Developer 2:** Copy and paste the entire block below into your AI Agent / IDE. This tracks ONLY the frontend application and healthcare user experience.

---

```markdown
You are an expert Frontend Engineer & UI/UX Designer working on the Hacktoberfest × MOSS Hack Day Udupi project: Vajra Health.
Your teammate is independently building the backend in `backend/`. 
YOU MUST ONLY CREATE AND MODIFY FILES IN `dpdpa_shield/frontend/`. Do NOT touch `backend/`.

Follow the exact API contracts specified in `PARALLEL_DEV_PLAN.md` and architecture in `SRS2.md`.
Use the existing design system tokens and glassmorphic dark-mode styling already present in `frontend/src/`.

### Your Scope of Work (Track B):

1. **TypeScript Definitions (`frontend/src/types/healthcare.ts`):**
   - Define types matching `PARALLEL_DEV_PLAN.md`:
     - `HealthcarePatient`, `HealthcareConsent`, `AccessDecisionResponse`, `ClinicalRecordItem`, `EmergencyOverrideRequest`, `AIEvaluationResponse`, `ProofVaultAuditRecord`.

2. **API Client & Mock Mode (`frontend/src/lib/api/healthcare.ts`):**
   - Create functions calling `/api/v1/healthcare/*` and `/api/v1/healthcare/ai/*`.
   - **Crucial Feature:** Include a local mock fallback (`USE_MOCK_DATA = true` when backend is unreachable or during independent development). Include rich mock data for patient **Priya Sharma (MRN-2024-8842)** so you can test the UI in real-time without needing the backend running!

3. **Page 1: Universal Patient Consent Portal (`frontend/src/app/healthcare/PatientConsentPortal.tsx`):**
   - Route: `/healthcare/patient`
   - Patient Profile header: Priya Sharma (`MRN-2024-8842`).
   - Granular Purpose Cards: Toggles for `Treatment`, `Diagnostics`, `Research`, `Insurance`, `Emergency`.
   - Category chips under each purpose showing Allowed (green check) vs Denied (red cross).
   - "Explain My Consent" Drawer / Modal: Powered by Gemma 4. Allows user to select language (Hindi, English, Kannada, Tamil) and view clear, jargon-free bullet points explaining what data is shared.
   - Paper Consent Form Uploader: Drag-and-drop zone for uploading paper consent photos. Displays Gemma 4 digitized extracted JSON preview with an "Accept & Save" button.

4. **Page 2: Clinician Access View (`frontend/src/app/healthcare/ClinicianAccessView.tsx`):**
   - Route: `/healthcare/clinician`
   - Context Bar: Department Selector (Cardiology, Oncology, Dentistry, Psychiatry, General Medicine, Emergency), Purpose Selector (`treatment`), Patient MRN input.
   - Core Split Grid (The Money Shot):
     - **Allowed Records (Emerald glow cards):** Shows full clinical details (e.g. Vitals: BP 120/80, Pulse 72; Medications: Metformin 500mg).
     - **Redacted Records (Crimson glow cards):** High-contrast red banner with lock icon:  
       `🔒 [REDACTED — no consent for mental_health under purpose 'treatment']`  
       Explains: "Under DPDPA Section 6, this category is protected and not accessible."
   - Emergency "Break the Glass" Button:
     - Prominent pulsating red button `🚨 Break The Glass (Section 7 Override)`.
     - Opens confirmation modal requiring clinician justification text.
     - On submission: instantly updates records to show unlocked state with a prominent yellow emergency banner and audit hash.
   - Clinician Access Advisor Drawer:
     - Chat-style widget where clinician can type queries (e.g., *"Can I access Priya's psychiatric notes?"*).
     - Displays Gemma 4 response citing DPDPA 2023 Section 6(1).

5. **Page 3: DPO & Compliance Audit Dashboard (`frontend/src/app/healthcare/HealthcareAuditDashboard.tsx`):**
   - Route: `/healthcare/audit`
   - Cryptographic Proof Timeline: Chronological stream of access evaluations and emergency overrides with block numbers, timestamps, and SHA-256 hashes.
   - "Verify Proof Vault Integrity" button: Animates down the block chain and displays `✅ Proof Vault Intact — 0 Tampering Detected`.
   - Emergency Override Review Queue: Lists any Break-the-Glass incidents with clinician justification for DPO sign-off.
   - Gemma 4 Compliance Health Score widget (displays 94% score with breakdown).

6. **Routing & Sidebar Integration:**
   - In `frontend/src/router/index.tsx`: Register `/healthcare/patient`, `/healthcare/clinician`, `/healthcare/audit`.
   - In `frontend/src/router/pathMap.ts` (or sidebar config): Add a **Vajra Healthcare** section with links to the 3 views.

7. **Verification:**
   - Run: `npm run dev` in `frontend/` and verify all 3 pages render beautifully, toggles work, split cards display correctly, and modal flows succeed.
```
