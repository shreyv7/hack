# DPDPA Shield — Compliance Guide

This guide provides an onboarding path for the **Compliance** module cluster, helping organizations monitor regulatory posture, manage security safeguards, and respond to data breaches.

**Route:** `/compliance/guide`

---

## 1. What is Compliance in DPDPA Shield?

The Compliance cluster helps you understand, measure, and demonstrate your DPDPA compliance posture through structured assessments, regulatory mapping, and incident response workflows.

---

## 2. Module Map

| Module | Route | What It Does |
| :--- | :--- | :--- |
| **Compliance Score** | `/compliance/score` | Overall DPDPA compliance score with section breakdown |
| **DPDPA Map** | `/compliance/map` | Interactive map of DPDPA sections with gap analysis |
| **Security Safeguards** | `/security/safeguards` | Security control assessment and evidence tracking |
| **Breach Disclosure Wizard** | `/breach` | Step-by-step personal data breach notification workflow |
| **Audit Log** | `/audit/log` | Immutable audit trail of all platform actions |

---

## 3. Recommended Setup Order

### Step 1: Establish Baseline
1. Complete **Workspace Info** and **Industry Config** (prerequisites for scoring).
2. Open **Compliance Score** and run initial calculation.
3. Review **DPDPA Map** to identify highest-priority gaps.

### Step 2: Address Gaps
Work through DPDPA Map sections in priority order:
*   **Section 6 (Consent)** — Set up Purpose Registry, notices, banners.
*   **Section 8 (Obligations)** — Build Data Inventory, security safeguards.
*   **Section 11 (Rights)** — Configure Rights Portal and DSAR tracker.
*   **Section 9 (Children)** — Register children's data if applicable.

### Step 3: Security Safeguards
*   Complete the Security Safeguards assessment.
*   Upload evidence for each control (encryption, access control, incident response).
*   Track remediation of failed controls.

### Step 4: Breach Preparedness
*   Walk through the **Breach Disclosure Wizard** as a tabletop exercise.
*   Configure notification templates and stakeholder contacts.
*   Understand the 72-hour notification timeline under DPDPA Rules.

### Step 5: Ongoing Monitoring
*   Review **Compliance Score** weekly.
*   Monitor **Audit Log** for unauthorized actions.
*   Use **Automation Coverage** to track which modules are fully configured.

---

## 4. Compliance Score Explained

The compliance score (0–100) is calculated from weighted section scores:

| Section | Weight | Key Inputs |
| :--- | :--- | :--- |
| Consent Management | 25% | Published notices, active banners, proof vault health |
| Data Protection | 20% | Inventory coverage, PII scan results, retention policies |
| Data Principal Rights | 15% | Rights portal config, DSAR SLA compliance |
| Security Safeguards | 15% | Control assessment completion, evidence uploads |
| Governance | 15% | RoPA completeness, DPIA coverage, vendor assessments |
| Breach Readiness | 10% | Wizard completion, incident response plan |

Recalculate the score after completing module setup. Shield AI can explain specific gaps and recommend remediation steps.

---

## 5. DPDPA Map Usage

The DPDPA Map visualizes each statutory section with:
*   **Status**: Compliant (green), Partial (amber), Gap (red), Not Applicable (grey)
*   **Evidence links**: Direct links to relevant module pages
*   **Gap descriptions**: What's missing and how to fix it
*   **Shield AI recommendations**: AI-generated remediation suggestions

Click any section to see detailed requirements and linked modules.

---

## 6. Breach Disclosure Workflow

The Breach Disclosure Wizard guides you through:

1. **Incident Detection** — Record when and how the breach was discovered.
2. **Impact Assessment** — Number of data principals affected, data categories involved.
3. **Containment** — Actions taken to stop ongoing breach.
4. **Notification Decision** — Whether notification to DPBI and data principals is required.
5. **DPBI Notification** — Draft and submit notification within statutory timeline.
6. **Data Principal Notification** — Draft communication to affected individuals.
7. **Remediation Plan** — Steps to prevent recurrence.
8. **Proof Vault Seal** — Immutable record of the entire disclosure process.

---

## 7. Audit Log

The Audit Log records all significant platform actions:
*   User logins and role changes
*   Consent notice publishes and banner deployments
*   Data source connections and credential changes
*   DSAR submissions and completions
*   Enforcement mode changes
*   Policy publishes and DPIA approvals

Filter by user, action type, date range, and module. Export for external audit requirements.

---

## 8. DPDPA Sections Covered

| Section | Topic | Primary Module |
| :--- | :--- | :--- |
| Section 6 | Consent | Consent Management cluster |
| Section 7 | Legitimate uses | Purpose Registry legal basis |
| Section 8 | Data Fiduciary obligations | Data Protection + Security Safeguards |
| Section 9 | Children's data | Children's Data module |
| Section 10 | Significant Data Fiduciary | Industry Config SDF assessment |
| Section 11 | Data Principal rights | Rights Portal + DSAR Tracker |
| Section 14 | Breach notification | Breach Disclosure Wizard |
| Section 16 | Cross-border transfer | Cross-Border Transfer (Governance) |

---

## 9. Common Questions

**Q: What's a good compliance score to target?**
A: Aim for 70+ before going live with consent enforcement. 85+ indicates strong posture for regulatory inquiry readiness.

**Q: How often should I recalculate the score?**
A: After any significant module change. Weekly during initial setup, monthly in steady state.

**Q: Does the platform guarantee DPDPA compliance?**
A: No tool can guarantee compliance. DPDPA Shield provides evidence, workflows, and gap visibility. Legal review by qualified counsel is always recommended.

**Q: What triggers a breach notification requirement?**
A: Under DPDPA Rules, notification to the Data Protection Board is required when a personal data breach is likely to affect data principals. The wizard helps assess this threshold.
