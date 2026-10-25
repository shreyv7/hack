# Consent Notices & Purpose Registry — Module Summary

> **Scope:** Core Consent Management — purposes, notices, versioning, and publish workflow  
> **Related design spec:** [CONSENT_MANAGEMENT_DESIGN.md](./CONSENT_MANAGEMENT_DESIGN.md)

---

## What this module does in the portal

This is the **heart of consent compliance** under DPDPA Sections 5 and 6. It lets each organization:

1. Define **why** they process personal data (**Purpose Registry**)  
2. Build **transparent consent notices** that link to those purposes (**Consent Notices Manager**)  
3. Publish notices with **immutable version history** for regulatory proof  

The module ensures consent is **specific, informed, and purpose-bound** — not a generic checkbox.

---

## Two building blocks

### Purpose Registry
A catalog of processing purposes for the organization.

Each purpose records:
- Name and description  
- **Legal basis** — consent or legitimate use  
- Data categories processed  
- Retention period  
- Whether it involves special-category / sensitive data  

### Consent Notices Manager
The notice library — each notice can have multiple **versions** (draft → live → archived).

Each notice version includes:
- Opening statement and display language  
- DPO / contact details (pulled from workspace settings)  
- Data principal rights and grievance text  
- Linked purposes (many-to-many)  
- Compliance warnings before publish  

---

## Purpose Registry — detail

### What users do
- Create, edit, and archive purposes  
- View which live notices reference a purpose  
- Export purpose inventory as evidence  

### Inputs → outputs

| Input | Output / effect |
|-------|-----------------|
| Purpose name, basis, categories, retention | `purposes` row scoped to org |
| Link purpose to notice draft | Junction in `notice_version_purposes` |
| Archive purpose | Soft-archive; blocked if tied to a **live** notice |

### Data flow
```
Admin defines purposes (Purpose Registry)
  → POST /api/consent/purposes
  → Purposes available in Notice Builder dropdown
  → Published notice lists all linked purposes for data principals
```

---

## Consent Notices Manager — detail

### What users do
- Browse notice library (live, draft, archived)  
- Create new notice or new draft from live version  
- Edit draft content and linked purposes  
- Run **compliance check** (warnings for missing DPO, withdrawal language, etc.)  
- **Publish** draft → becomes live; previous live version archived  
- Export consent evidence pack (PDF)  

### Versioning rules (important for audits)
1. New notice starts as **draft v1**  
2. Only **drafts** can be edited  
3. **Publish** freezes that version as **live** — it is never mutated again  
4. To change a live notice → **“Create draft from live”** → new draft vN+1  
5. Publish requires at least **one linked purpose**  

This gives auditors a clear timeline: what text was live, when, and who published it.

### Inputs → outputs

| Input | Output / effect |
|-------|-----------------|
| Notice title, fields, language, rights text | `consent_notice_versions` draft row |
| Selected purposes | Linked via `notice_version_purposes` |
| Publish action | Status `live`, `published_at`, `published_by_user_id` set |
| Compliance check | List of warnings; optional auto-fix suggestions |

### Data flow (end-to-end)
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Purpose Registry│────►│ Notice Builder   │────►│ Publish (live ver.) │
│ (define whys)   │     │ (draft + link)   │     │ immutable snapshot  │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
         │                        │                         │
         └────────────────────────┴─────────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │ Banner / SDK / Integrations │
                    │ (delivery to end users)     │
                    └─────────────┬──────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │ Proof Vault + Audit Log     │
                    │ (consent proof & events)    │
                    └────────────────────────────┘
```

---

## How this connects to the rest of Consent Management

| Related feature | Relationship |
|-----------------|--------------|
| **Create Consent (Banner Builder)** | Renders live notice content on websites/apps |
| **Multi-Language Editor** | Localized notice text variants |
| **Cookie & Tracker Manager** | Cookie purposes aligned with notice purposes |
| **Consent Withdrawal Flow** | Honours §6(4) — withdraw as easily as give |
| **Notice Delivery Channels** | Email, SMS, in-app delivery configuration |
| **Proof Vault** | Stores consent decision records from integrations |
| **Audit Log** | Records publish, archive, and configuration events |
| **Workspace Settings** | Supplies org name, DPO email, contact for notices |

---

## DPDPA alignment (business language)

| Statute area | How the module supports it |
|--------------|----------------------------|
| **§5 Notice** | Structured notice fields: opening statement, contact, rights, retention |
| **§6(1) Specific consent** | Each purpose explicit; notice must link ≥1 purpose to publish |
| **§6(3) Plain language + contact** | Compliance check warns if DPO/contact missing |
| **§6(4–6) Withdrawal** | Warnings if consent purposes lack withdrawal language |
| **§6(10) Proof burden** | Immutable live versions + publish timestamp + publisher identity |

---

## Access control & multi-tenancy

- All purposes and notices are **scoped to one organization**  
- **Read:** any org member (admin or user)  
- **Write / publish:** org admin (superadmin with org picker)  
- Superadmin uses `?org_id=` query param to manage a selected tenant  

---

## Weekly update talking points

- **Purpose Registry** gives a single source of truth for *why* data is processed  
- **Consent Notices Manager** implements **draft → publish → immutable live** versioning for audit defensibility  
- **Compliance checks** run before publish to catch missing DPO, withdrawal language, and purpose gaps  
- Notices **pull tenant profile** from Workspace Settings (DPO, org name)  
- Published notices feed **banner/SDK delivery**, **Proof Vault**, and **Audit Log** — completing the consent evidence chain  

---

## Key implementation references

| Area | Location |
|------|----------|
| Consent API | `backend/app/routers/consent.py` |
| Models | `purposes`, `consent_notices`, `consent_notice_versions`, `notice_version_purposes` |
| Frontend API | `frontend/src/lib/api/consent.ts` |
| Hook | `frontend/src/hooks/useConsentManagement.ts` |
| Pages | `PurposeRegistryNew`, `ConsentNoticesManager`, `NewConsentNotice` |
| Tests | `python -m app.scripts.test_consent_api` |
