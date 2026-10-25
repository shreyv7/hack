# Vajra — Bank Identifier Settings Technical Specification

This document covers the **Bank Identifier Settings** page (`/consent/banking/identifiers`) within the Advanced Consent Management cluster.

---

## 1. Module Overview

### 1.1 Purpose
Configure which customer identifier types the bank collects for consent purposes. Only **enabled** identifier types can be used on journeys — enforcing DPDPA data minimization by preventing collection of unnecessary identifiers.

### 1.2 Business Objective
Banks collect multiple identifier types (CIF, account number, PAN, email, phone). This page defines the organization's identifier taxonomy and which types are active, sensitive, and eligible for offline capture.

### 1.3 DPDPA Compliance Objective
*   **Section 6(3)**: Data minimization — only collect identifiers needed for the stated purpose.
*   **Section 8(5)**: Sensitive identifiers (PAN, account number) marked and hashed at storage.

---

## 2. Detailed Screen Specification

**Route:** `/consent/banking/identifiers`

### 2.1 Identifier Type Configuration Table
Each row represents an identifier type:

| Column | Description |
| :--- | :--- |
| **Key** | Internal slug (e.g., `cif`, `account_number`, `pan`) |
| **Label** | Display name (e.g., "Customer Information File") |
| **Storage** | `email`, `phone`, or `token` (hashed) |
| **Enabled** | Whether this type is available for journeys |
| **Sensitive** | Flags PII requiring extra protection |
| **Offline Capture** | Whether branch staff can capture without network |

### 2.2 Default Identifier Types
*   **email** — normalized email address
*   **phone** — E.164 India phone normalization
*   **cif** — Customer Information File (token storage)
*   **account_number** — Bank account number (token storage)
*   **pan** — Permanent Account Number (token storage, sensitive)

### 2.3 Actions
*   Add custom identifier type
*   Enable/disable existing types
*   Toggle sensitive flag
*   Toggle offline capture allowance
*   Save configuration

### 2.4 Data Minimization Rule
> Only enabled identifier types can be used on journeys. Disabled types are hidden from branch capture, merchant capture, and digital journey forms.

---

## 3. User Journey

1. DPO opens Bank Identifier Settings.
2. Reviews default identifier types (email, phone, CIF, account number, PAN).
3. Enables required types; disables types not needed (e.g., disable PAN for non-KYC journeys).
4. Marks PAN and account number as sensitive.
5. Enables offline capture for CIF (branch counter use).
6. Saves configuration.
7. Journey & Channel Mapping page now shows only enabled types.

---

## 4. Relationships

| Module | Relationship |
| :--- | :--- |
| **Journey & Channel Mapping** | Journeys reference enabled identifier types |
| **Branch Consent Capture** | Capture form shows enabled types only |
| **Customer Consent Registry** | Lookup by any enabled identifier type |
| **ConsentPrincipalService** | Server-side normalization and fingerprinting |

---

## 5. Backend Architecture

*   **Config endpoint**: `GET/PATCH /api/consent/banking/config`
*   **Model**: `ConsentIndustryConfig.identifier_types` (JSON array)
*   **Fingerprinting**: `ConsentPrincipalService._normalize_token()` per storage type

---

## 6. QA Verification Matrix

*   **TC-01**: Disable PAN; verify PAN field hidden in branch capture form.
*   **TC-02**: Add custom identifier; appears in journey mapping picker.
*   **TC-03**: Sensitive flag triggers additional audit logging on capture.
*   **TC-04**: Offline-enabled type capturable without network in branch mode.
