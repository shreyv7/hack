# Workspace & Settings Module — Summary

> **Scope:** All four Settings pages — foundation configuration for each tenant  
> **Related design spec:** [WORKSPACE_SETTINGS_DESIGN.md](./WORKSPACE_SETTINGS_DESIGN.md)

---

## What this module does in the portal

Before a customer can publish consent notices or demonstrate DPDPA compliance, the platform needs to know **who they are**, **how they deploy**, **what industry they operate in**, and **what role they play under the Act** (Data Fiduciary, Processor, Significant Data Fiduciary).

The Workspace & Settings module is the **tenant profile and DPDPA posture setup**. Answers captured here flow into evidence exports, obligation comparisons, compliance scoring context, and notice templates across the rest of the portal.

---

## The four settings pages

| # | Page | Primary question it answers |
|---|------|----------------------------|
| 1 | **Workspace Info** | Who is this organization and what solution do they offer? |
| 2 | **Deployment Settings** | Where does data live and how is the platform deployed? |
| 3 | **Industry Config** | What sector are they in and are they a Significant Data Fiduciary (SDF)? |
| 4 | **DPDP Role Mapping** | Are they a Fiduciary, Processor, or SDF — and who are their processors? |

All four pages share the same **org-scoped workspace API** (`/api/workspace`). Settings are created automatically when an organization is provisioned.

---

## Page 1 — Workspace Info

### Purpose
Captures the **legal and product identity** of the tenant — the information that appears on notices, exports, and audit evidence.

### What users configure (inputs)
- Organization display name  
- Registered address, headquarters, India presence  
- Solution / product description  
- Logo URL  
- DPO name and contact email  
- Compliance version, changelog, attestation metadata  

### What the portal uses (outputs)
- Organization name on consent notices and PDF exports  
- DPO block on published notices (required for DPDPA §6 compliance checks)  
- Profile section of **evidence packs** for regulators or internal audit  

### Data flow
```
Admin edits profile in UI
  → PATCH /api/workspace/profile
  → organization_settings + organizations.name updated
  → Consent notice builder reads DPO/contact fields
  → Evidence export PDFs include tenant profile
```

---

## Page 2 — Deployment Settings

### Purpose
Documents **how and where** personal data is processed — critical for data residency questions under DPDPA and for customer security questionnaires.

### What users configure (inputs)
- Deployment model: public cloud, private cloud, hybrid, on-premises  
- Primary hosting region(s)  
- **Data residency matrix** — per data category: region, cross-border flag, legal basis  

### What the portal uses (outputs)
- Residency summary on workspace evidence exports  
- Cross-border warnings when categories are stored outside India  
- Deployment context for compliance and vendor discussions  

### Data flow
```
Admin selects deployment model + residency rows
  → PATCH /api/workspace/deployment
  → deployment_model, regions, data_residency JSON stored
  → Deployment evidence PDF / full evidence pack
```

---

## Page 3 — Industry Config

### Purpose
Aligns the tenant with **industry-specific DPDPA expectations** and **Significant Data Fiduciary (SDF)** thresholds.

### What users configure (inputs)
- Primary industry (e.g. Banking, Healthcare, E-commerce)  
- Secondary sectors / sub-industries  
- Data principals count band  
- Annual revenue band  
- SDF eligibility flags and assessment notes  

### What the portal uses (outputs)
- Industry context on role mapping and obligation views  
- SDF-related obligations highlighted when thresholds are met  
- Industry section in workspace evidence exports  

### Data flow
```
Admin sets industry + SDF bands
  → PATCH /api/workspace/industry
  → primary_industry, secondary_industries, SDF fields stored
  → DPDP Role Mapping page reflects SDF status
  → Obligation matrix shows SDF-mandatory items when applicable
```

---

## Page 4 — DPDP Role Mapping

### Purpose
The **legal positioning** page — declares whether the customer is a Data Fiduciary, Data Processor, or Significant Data Fiduciary, lists **third-party processors**, and maps **DPDPA obligations** to platform features.

### What users configure (inputs)
- DPDP role selection (fiduciary / processor / SDF)  
- Role assessment questionnaire answers  
- **Data processors table** — vendor name, DPA status, risk level, processing description  
- Optional reassessment / SDF confirmation  

### What the portal uses (outputs)
- Obligation comparison matrix (seeded catalog vs. org role)  
- Processor inventory for vendor risk and RoPA-style evidence  
- Role-based compliance narrative in exports  
- SDF flag drives stricter obligation labels (e.g. DPO, DPIA, auditor)  

### Data flow
```
Admin selects role + adds processors
  → PATCH /api/workspace/role-mapping
  → POST/PATCH/DELETE /api/workspace/processors
  → dpdp_role, role_assessment, data_processors rows stored
  → GET /api/workspace/obligations returns catalog filtered by role
  → Evidence pack includes role matrix + processor list
```

---

## Access control

| Action | Admin | User | Superadmin |
|--------|:-----:|:----:|:----------:|
| View all four pages | ✅ | ✅ | ✅ (with org picker) |
| Edit / save settings | ✅ | ❌ | ✅ |
| Export evidence packs | ✅ | ❌ | ✅ |

Organization must be **active** or **pending** (signup flow). Users without an org cannot access workspace APIs.

---

## End-to-end data flow (module level)

```
Organization created (auth/admin)
  → Default organization_settings row auto-created
  → Admin completes 4 settings pages
  → Profile + deployment + industry + role stored per org
  → Downstream modules consume settings:
       • Consent notices (DPO, org name, contact)
       • Compliance map (feature ↔ statute linkage)
       • Evidence PDFs (profile, residency, role, processors)
       • DSAR public portal branding (org slug, DPO from settings)
```

---

## Weekly update talking points

- **Four-page settings wizard** gives each tenant a complete DPDPA onboarding profile  
- Settings are **org-isolated**, **admin-writable**, and **evidence-exportable**  
- **DPDP Role Mapping** connects legal role (Fiduciary / Processor / SDF) to a live obligation matrix and processor register  
- **Deployment & residency** matrix supports cross-border and India-presence documentation  
- Workspace data **feeds consent notices, compliance exports, and DSAR portal branding** — not a standalone silo  

---

## Key implementation references

| Area | Location |
|------|----------|
| Workspace API | `backend/app/routers/workspace.py` |
| Models | `organization_settings`, `data_processors`, `dpdp_obligation_definitions` |
| Frontend API | `frontend/src/lib/api/workspace.ts` |
| Hook | `frontend/src/hooks/useWorkspaceSettings.ts` |
| Pages | `WorkspaceInfo`, `DeploymentSettings`, `IndustryConfig`, `DPDPRoleMapping` |
