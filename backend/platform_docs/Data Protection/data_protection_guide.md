# Vajra — Data Protection Guide

This guide provides an onboarding path for the **Data Protection** module cluster, helping organizations establish visibility and control over personal data across their systems.

**Route:** `/data-protection/guide`

---

## 1. What is Data Protection in Vajra?

The Data Protection cluster answers three fundamental questions:
1. **Where** is personal data stored? → **Data Sources**
2. **What** personal data do we have? → **Data Inventory**
3. **How** do we protect and lifecycle it? → **PII Scanner, Masking, Anonymisation, Retention**

---

## 2. Module Map

| Module | Route | What It Does |
| :--- | :--- | :--- |
| **Data Sources** | `/data/sources` | Register database, cloud, file, API, and log connections |
| **Data Inventory** | `/data/inventory` | Catalog assets, fields, classifications, and processors |
| **PII Scanner** | `/scanner/pii` | Scan live data to detect and classify personal information |
| **Data Masking** | `/data/masking` | Apply masking rules to sensitive fields in connected sources |
| **Data Anonymisation** | `/scanner/anonymisation` | Irreversibly anonymize datasets for analytics/research |
| **Retention Policies** | `/data/retention` | Define when data should be deleted, archived, or anonymized |
| **Children's Data** | `/data/children` | Track and protect children's personal data (Section 9) |

---

## 3. Recommended Setup Order

### Step 1: Register Data Sources
Start by connecting your systems in **Data Sources**:
*   Register production databases (PostgreSQL, MySQL, etc.)
*   Add cloud storage (S3, Azure Blob, GCS)
*   Configure API endpoints and log streams
*   Test each connection (status should show "Connected")
*   Assign an owner and set environment (production/staging)

### Step 2: Build Data Inventory
Move to **Data Inventory**:
*   Create assets linked to your data sources
*   Run schema introspection to auto-discover tables and columns
*   Classify fields (personal, sensitive, public, internal)
*   Link data processors (vendors) to assets
*   Map purposes to fields (for consent enforcement integration)

### Step 3: Scan for PII
Use the **PII Scanner**:
*   Create scan jobs against connected data sources
*   Review detected PII with confidence scores
*   Auto-classify findings into Data Inventory
*   Address unencrypted PII fields flagged as risks

### Step 4: Apply Protections
*   **Data Masking**: Create masking rules for fields used in non-production environments
*   **Data Anonymisation**: Anonymize datasets for analytics teams
*   **Retention Policies**: Define retention periods and automated deletion/anonymization

### Step 5: Children's Data
If you process children's data:
*   Register child data records in **Children's Data**
*   Configure verifiable parental consent workflows
*   Apply enhanced retention and access controls

---

## 4. Key Workflows

### Schema Discovery Workflow
Data Sources (connect) → Data Inventory (introspect) → PII Scanner (scan) → Classify fields

### Consent Enforcement Integration
Data Inventory (map fields to purposes) → Consent Enforcement (configure mappings) → Withdrawal triggers remediation on mapped fields

### Retention Workflow
Retention Policies (define rules) → Connect to data source → Dry-run count → Execute deletion/anonymization → Proof Vault seal

### Cross-Border Check
Data Sources (set region) → Governance → Cross-Border Transfer (verify approved destinations)

---

## 5. Data Source Governance

Each data source supports governance metadata:
*   **Owner** — accountable person for the source
*   **Environment** — production, staging, development, test
*   **Criticality** — low, medium, high, critical
*   **Data Processor** — linked third-party vendor
*   **Region** — geographic location for residency checks
*   **Integration Mode** — discovery (read-only) vs read_write (for masking/retention)
*   **Encryption at Rest** — whether data is encrypted in the target system

The **Source Detail Drawer** shows a "Used In" panel linking to PII scans, retention policies, masking rules, and cross-border assessments.

---

## 6. Playbooks

Each Data Protection module includes an in-app **Playbook** (right drawer):
*   **Data Sources Playbook** — connection setup, governance, go-live checklist
*   **Data Inventory Playbook** — asset cataloging, classification, processor linking
*   **Data Masking Playbook** — DPDPA safeguard implementation, live data usage map, mask vs delete guidance
*   **PII Scanner Playbook** — scan lifecycle, compliance gap analysis

Open the playbook from the module page header to see prerequisites, step-by-step instructions, and troubleshooting.

---

## 7. DPDPA Sections Addressed

| Section | Requirement | Data Protection Module |
| :--- | :--- | :--- |
| **Section 8(1)** | Fiduciary accountability | Data Inventory asset register |
| **Section 8(2)** | Data processor contracts | Processor DPA tracking in inventory |
| **Section 8(5)** | Security safeguards | PII scanner, masking, encryption audit |
| **Section 9** | Children's data | Children's Data module |
| **Section 11** | Right to erasure | Retention policies with deletion triggers |
| **Section 16** | Cross-border transfer | Region tracking + cross-border module |

---

## 8. Common Questions

**Q: Do I need to connect live databases?**
A: For full compliance, yes. You can start with manual inventory entry, but PII scanning and retention require connected sources.

**Q: What's the difference between masking and anonymisation?**
A: **Data Masking** rewrites PII in place on connected SQL/MongoDB sources (strategies include irreversible hash/redact and reversible encrypt). **Data Anonymisation** exports and irreversibly transforms whole datasets for analytics — used for file/API sources and research use cases.

**Q: How does retention connect to consent withdrawal?**
A: When a purpose is withdrawn, `purpose_data_mappings` trigger retention runs with `TriggerEvent.consent_withdrawal` on mapped fields.

**Q: Can I use Data Protection without Consent Management?**
A: Yes, but linking purposes to inventory fields enables the full consent enforcement and withdrawal remediation pipeline.
