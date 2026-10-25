# DPDPA Shield — How to Use Guide

This guide helps new users navigate the DPDPA Shield platform and understand the recommended implementation order for achieving DPDPA compliance.

**Route:** `/how-to-use`

---

## 1. Welcome to DPDPA Shield

DPDPA Shield is an enterprise compliance platform for the **Digital Personal Data Protection Act, 2023 (DPDPA)**. It helps Indian organizations manage consent, protect personal data, respond to data principal rights, and demonstrate compliance to regulators.

---

## 2. Platform Structure

The sidebar is organized into these sections:

| Section | Purpose |
| :--- | :--- |
| **Overview** | Dashboard, compliance score, automation coverage |
| **Consent Management** | Notices, banners, purposes, enforcement, proof vault |
| **Advanced Consent Management** | Banking-specific consent (visible for banking industry) |
| **Integrations** | Website SDK, mobile SDK, tag manager, API & webhooks |
| **Data Protection** | Data sources, inventory, PII scanner, masking, retention |
| **Data Principal Rights** | Rights portal, DSAR tracker, activity logs |
| **Compliance** | DPDPA map, security safeguards, breach wizard, audit log |
| **Governance** | RoPA, DPIA, policies, vendor risk, cross-border, CISO |
| **Settings** | Workspace, deployment, industry config, role mapping |
| **Administration** | Organizations, approvals, team management (role-gated) |
| **Shield AI** | AI compliance assistant with platform knowledge |

---

## 3. Recommended Implementation Order

### Phase 1 — Foundation (Week 1-2)
1. **Workspace Info** — Set organization name, DPO contact, primary region.
2. **Industry Config** — Select industry, assess SDF eligibility.
3. **DPDP Role Mapping** — Assign DPO, IT admin, compliance manager roles.
4. **Team & Users** — Invite team members with appropriate roles.

### Phase 2 — Consent Management (Week 2-4)
5. **Purpose Registry** — Define all processing purposes with legal bases.
6. **Consent Notices Manager** — Author and publish consent notices.
7. **Create Consent (Banner)** — Build and deploy consent banners.
8. **Integrations → Website** — Deploy SDK on your website.
9. **Proof Vault** — Verify consent receipts are being sealed.

### Phase 3 — Data Protection (Week 3-5)
10. **Data Sources** — Register database connections and file stores.
11. **Data Inventory** — Catalog data assets and classify fields.
12. **PII Scanner** — Scan live data for personal information.
13. **Retention Policies** — Define data retention and erasure rules.

### Phase 4 — Rights & Compliance (Week 4-6)
14. **Rights Portal** — Configure public-facing data principal rights portal.
15. **DSAR SLA Tracker** — Set up DSAR intake and SLA tracking.
16. **DPDPA Map** — Review compliance gaps and remediation plan.
17. **Compliance Score** — Monitor overall compliance posture.

### Phase 5 — Governance & Advanced (Week 5-8)
18. **RoPA Module** — Document processing activities.
19. **DPIA Module** — Conduct data protection impact assessments.
20. **Vendor Risk Intelligence** — Assess third-party processor risks.
21. **Consent Enforcement** — Enable server-side consent enforcement.
22. **Breach Disclosure Wizard** — Prepare incident response workflow.

---

## 4. Key Concepts

### Purposes
A **purpose** defines *why* you process personal data (e.g., "Marketing SMS", "Order Fulfillment"). Every consent notice, enforcement rule, and retention policy references purposes from the Purpose Registry.

### Consent Notices vs Banners
*   **Consent Notice** = the legal text explaining what data you collect and why.
*   **Consent Banner** = the UI widget that displays the notice and collects consent on your website/app.

### Enforcement Modes
Consent Enforcement has three modes:
*   **Disabled** — No blocking (default, safe starting point).
*   **Shadow** — Logs what *would* be denied without actually blocking.
*   **Enforced** — Actively blocks unauthorized data processing server-side.

Always start in Shadow mode and review evidence before promoting to Enforced.

### Data Sources vs Data Inventory
*   **Data Sources** = *where* your data lives (databases, file stores, APIs).
*   **Data Inventory** = *what* data you have (tables, fields, classifications).

Register sources first, then build your inventory from schema introspection or manual entry.

---

## 5. Using Shield AI

Click **Shield AI** in the sidebar footer to open the compliance copilot. Shield AI can:
*   Answer DPDPA legal questions with section citations.
*   Guide you step-by-step through platform features.
*   Summarize your compliance posture using live workspace data.
*   Draft consent notices, DSAR response templates, and policy documents.

**Tips:**
*   Toggle "Use company data" to include live workspace context.
*   Use suggestion chips for common questions.
*   Shield AI references platform documentation — ask "How do I set up consent enforcement?" for step-by-step guidance.

---

## 6. Getting Help

*   Each module has an in-app **Playbook** (right drawer) with prerequisites, implementation steps, and troubleshooting.
*   **Compliance Guide**, **Data Protection Guide**, and **Governance Guide** provide section-specific onboarding.
*   Use **Shield AI** for interactive guidance.
*   Contact your DPO or ZeroShield support for legal interpretation questions.

---

## 7. Role-Based Access

| Role | Access |
| :--- | :--- |
| **Viewer** | Read-only access to dashboards and reports |
| **Admin** | Full module access within their organization |
| **Superadmin** | Cross-organization management, pending approvals |

Some pages (Logs, Organizations, Pending Approvals) are restricted to specific roles. See DPDP Role Mapping for details.
