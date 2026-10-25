# Compliance Module — Summary
 
> **Scope:** All four Compliance sidebar pages — map, safeguards, breach, audit  
> **API prefix:** `/api/compliance`

---

## What this module does in the portal

While Consent Management handles **lawful collection**, the Compliance module helps organizations **demonstrate ongoing DPDPA compliance** — mapping statutes to platform features, tracking security controls, managing breach disclosure, and maintaining a **tamper-evident audit trail**.

Think of it as the **evidence and accountability layer** for regulators, internal audit, and the Data Protection Board.

---

## The four compliance pages

| # | Page | DPDPA focus | One-line purpose |
|---|------|-------------|------------------|
| 1 | **DPDPA Map** | Whole Act | See which statutes are covered by which portal features |
| 2 | **Security Safeguards Hub** | §8 — Security | Track security control implementation status |
| 3 | **Breach Disclosure Wizard** | §8(6) — Breach notification | Guided 72-hour breach assessment and notification workflow |
| 4 | **Audit Log (New)** | §8(5) — Audit trail | Immutable, hash-chained log of platform actions |

All pages are **org-scoped**. Superadmin selects tenant via org picker.

---

## Page 1 — DPDPA Map

### Purpose
An interactive **compliance coverage map** — chapters and sections of the DPDPA linked to implemented (or planned) ZeroShield features, with evidence counts and review status.

### What users do
- Browse chapters (Consent, Security, Rights, etc.)  
- Expand sections to see statute text and linked features  
- Mark sections as reviewed (admin)  
- Export compliance map PDF for board or regulator packs  

### Data flow

| Stage | Detail |
|-------|--------|
| **Input** | Admin review marks, org context |
| **Processing** | Map service merges seeded statute catalog with org review state |
| **Output** | Chapter/section summary, feature status (implemented / partial / advisory), navigable links to portal modules |

```
User opens DPDPA Map
  → GET /api/compliance/map/summary, /chapters, /sections/{key}
  → UI shows statute ↔ feature matrix
  → Admin PATCH /map/review updates last-reviewed metadata
  → PDF export for evidence pack
```

### Business value
Answers *“Which parts of the Act does our platform actually cover?”* in one view — ideal for compliance score discussions and gap analysis.

---

## Page 2 — Security Safeguards Hub

### Purpose
Operationalizes **Section 8 — reasonable security safeguards**. Organizations track a checklist of security controls (encryption, access management, logging, etc.) with status, notes, and evidence attachments.

### What users do
- View overall safeguards **coverage gauge** and penalty exposure summary  
- Expand individual controls; update status (e.g. not started → in progress → implemented)  
- Add implementation notes and evidence references  
- Export **security evidence pack** or auditor report PDF  

### Data flow

| Stage | Detail |
|-------|--------|
| **Input** | Control status updates, notes, evidence links (admin) |
| **Processing** | Safeguards service recalculates coverage % and gap counts |
| **Output** | Per-control read model, summary metrics, exportable PDFs |

```
Admin updates control status
  → PATCH /api/compliance/safeguards/controls/{id}
  → security_controls row updated for org
  → Summary gauge refreshes
  → Events optionally recorded in Audit Log
```

### Business value
Turns “we have security policies” into **trackable, exportable control evidence** aligned to DPDPA §8.

---

## Page 3 — Breach Disclosure Wizard

### Purpose
A **step-by-step wizard** for personal data breach response — from impact assessment through Data Protection Board (DPB) and data principal notifications, aligned with **72-hour notification** expectations.

### Wizard steps
1. **Impact Assessment** — severity, categories affected, data types, risk score  
2. **DPB Notification** — pre-filled intimation form for the Board  
3. **DP Notification** — message template for affected data principals  
4. **Public Disclosure** — conditional step for high-severity incidents  
5. **Submit & Track** — finalize, generate breach disclosure PDF, track status  

### What users do
- Create or resume a breach incident  
- Save draft at any step  
- Run countdown timer against 72-hour window  
- Submit and download **breach disclosure package** (PDF)  
- Mark DPB / principal notifications as sent  

### Data flow

| Stage | Detail |
|-------|--------|
| **Input** | Wizard form fields per step, severity, draft saves |
| **Processing** | Breach service persists incident + wizard JSON; validates step progression |
| **Output** | Incident record with reference ID, timestamps, notification flags, PDF export |

```
Security team detects breach
  → POST /api/compliance/breaches (create incident)
  → Steps 1–5 saved via PATCH (wizard_data JSON)
  → Submit → status updated, PDF generated
  → Audit Log records breach lifecycle events
```

### Business value
Structured, time-bound breach response with **documented outputs** for DPB and data principals — reduces ad-hoc spreadsheet workflows during incidents.

---

## Page 4 — Audit Log (New)

### Purpose
An **append-only, hash-chained audit trail** of significant actions across the portal — configuration changes, consent events, breach actions, rights/DSAR events, deletions, etc.

Each entry includes: timestamp, actor (email/role), action description, event type, severity, resource reference, and cryptographic link to the previous entry.

### What users do
- Search and filter events (type, actor, keyword)  
- View paginated event list with summary stats  
- **Verify integrity** — recompute hash chain to detect tampering  
- Export **audit evidence pack** PDF (includes verification result)  

### Data flow

| Stage | Detail |
|-------|--------|
| **Input** | Actions from users/system across modules (via `record_audit_event`) |
| **Processing** | Each entry hashed with previous entry hash (blockchain-style chain) |
| **Output** | Searchable log, integrity verification result, PDF export |

```
User publishes consent notice / resolves DSAR / updates safeguard
  → Service calls record_audit_event()
  → New audit_log_entries row with prev_hash + entry_hash
  → Audit Log UI lists events for org
  → “Verify integrity” walks full chain → pass/fail
```

### Business value
Provides **tamper-evident proof** that the organization’s compliance activity was recorded contemporaneously — critical for DPDPA §8(5) audit-trail expectations and external audits.

---

## How the four pages work together

```
                    ┌─────────────────┐
                    │   DPDPA Map     │
                    │ (what we cover) │
                    └────────┬────────┘
                             │ links to features
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌─────────────────┐  ┌──────────────┐
│ Security       │  │ Breach Wizard   │  │ Audit Log    │
│ Safeguards     │  │ (when things    │  │ (everything  │
│ (prevent)      │  │  go wrong)      │  │  recorded)   │
└────────────────┘  └─────────────────┘  └──────────────┘
```

- **Map** = strategic coverage view  
- **Safeguards** = preventive controls  
- **Breach Wizard** = incident response  
- **Audit Log** = continuous proof all of the above (and consent/DSAR actions) happened  

---

## Cross-module audit integration

The audit log is fed by multiple modules, not only Compliance:

| Source module | Example events |
|---------------|----------------|
| Consent Management | Notice published, purpose archived |
| Workspace Settings | Profile or role mapping updated |
| DSAR / Rights Portal | Request resolved |
| Compliance | Safeguard updated, breach submitted |

This makes Audit Log the **central evidence stream** for weekly compliance reporting.

---

## Access control

| Page | View | Edit / submit |
|------|:----:|:-------------:|
| DPDPA Map | All org members | Review marks: admin |
| Security Safeguards | All org members | Control updates: admin |
| Breach Wizard | All org members | Create/submit: admin |
| Audit Log | All org members | Read-only (system-written) |

Superadmin: org picker on all pages.

---

## Weekly update talking points

- **DPDPA Map** gives leadership a single view of statute-to-feature coverage with exportable evidence  
- **Security Safeguards Hub** tracks §8 control implementation with coverage metrics and PDF exports  
- **Breach Disclosure Wizard** guides 72-hour breach response with step saves and disclosure PDFs  
- **Audit Log** is **hash-chained and integrity-verifiable** — not a editable spreadsheet  
- Compliance module **integrates with Consent, Workspace, and DSAR** via shared audit event recording  

---

## Key implementation references

| Area | Location |
|------|----------|
| Compliance API | `backend/app/routers/compliance.py` |
| Services | `compliance_map_service`, `security_safeguards_service`, `breach_disclosure_service`, `audit_log_service` |
| Models | `backend/app/models/compliance.py` |
| Audit helper | `backend/app/services/audit_events.py` |
| Frontend pages | `DPDPAComplianceMap`, `SecuritySafeguardsHub`, `BreachDisclosureWizard`, `AuditLog` |
| Frontend hooks | `useComplianceMap`, `useSecuritySafeguards`, `useBreachWizard`, `useAuditLog` |
