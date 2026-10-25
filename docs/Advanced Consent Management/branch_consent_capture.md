# DPDPA Shield — Branch Consent Capture Technical Specification

This document covers the **Branch Consent Capture** page (`/consent/banking/branch-capture`) within the Advanced Consent Management cluster.

---

## 1. Module Overview

### 1.1 Purpose
Enable bank branch staff to capture customer consent in assisted (face-to-face) scenarios — account opening, product sales, KYC updates — with OTP verification, offline support, and full audit trail.

### 1.2 Business Objective
Branch counters are a primary consent collection point for banks. This module provides a staff-facing UI that guides branch employees through journey-based consent capture while ensuring DPDPA compliance.

### 1.3 DPDPA Compliance Objective
*   **Section 6(1)**: Informed consent — notice displayed and explained to customer at counter.
*   **Section 6(3)**: Notice at point of collection.
*   **Section 8(1)**: Staff actions logged with employee ID for accountability.

---

## 2. Detailed Screen Specification

**Route:** `/consent/banking/branch-capture`

### 2.1 Capture Flow

**Step 1 — Select Journey**
*   Dropdown of active branch-channel journeys
*   Journey description and required identifiers shown

**Step 2 — Enter Customer Identifiers**
*   Form fields based on journey's identifier requirements
*   CIF lookup (if configured) auto-populates customer name
*   Validation per identifier type (email format, phone E.164, etc.)

**Step 3 — Display Notice**
*   Full consent notice rendered (from journey's assigned notice version)
*   Staff must confirm notice was presented to customer
*   "Customer has read the notice" checkbox

**Step 4 — Purpose Consent**
*   Purpose toggles per journey configuration
*   Required purposes pre-checked (informational, not toggleable)
*   Optional purposes (marketing, analytics) with customer choice

**Step 5 — OTP Verification** (if journey requires)
*   OTP sent to customer's registered phone
*   Customer enters OTP on staff device or own phone
*   6-digit code verification with retry limit

**Step 6 — Confirm & Submit**
*   Summary of consent decisions
*   Staff ID recorded in audit trail
*   Submit creates consent receipt + Proof Vault seal
*   Print receipt option (thermal printer compatible)

### 2.2 Offline Mode
When network unavailable:
*   Capture stored locally in browser session storage
*   Synced automatically on reconnect via `OfflineSessionSyncRequest`
*   Integrity hash verified on sync

---

## 3. User Journey

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Branch Staff
    actor Customer as Customer
    participant UI as Branch Capture UI
    participant BE as Backend

    Staff->>UI: Select "Account Opening" journey
    Staff->>UI: Enter CIF, PAN, Phone
    UI->>BE: Lookup customer by CIF
    BE-->>UI: Customer name displayed
    Staff->>Customer: Present notice on screen
    Customer->>Staff: Reads notice
    Staff->>UI: Check "notice presented"
    Customer->>UI: Toggle marketing consent OFF
    UI->>BE: Send OTP to phone
    Customer->>UI: Enter OTP
    UI->>BE: Verify OTP + submit consent
    BE-->>UI: Receipt created; print option shown
```

---

## 4. Relationships

| Module | Relationship |
| :--- | :--- |
| **Journey & Channel Mapping** | Journey config drives capture form |
| **Bank Identifier Settings** | Identifier fields and validation |
| **Customer Consent Registry** | Receipt appears in registry |
| **Proof Vault** | Consent sealed on capture |
| **Received Consents** | Standard consent receipt view |

---

## 5. Backend Architecture

*   **Session service**: `ConsentCaptureSessionService` — OTP, offline sync
*   **Public API**: `POST /public/v1/integrations/{property_id}/consent/capture-session`
*   **OTP service**: `OtpService` — send and verify OTP
*   **Finalize**: `assisted_consent_finalize` — seal proof, dispatch webhook

---

## 6. Security & Compliance Requirements

*   Staff must be authenticated (logged-in bank employee).
*   OTP required for journeys handling sensitive data.
*   All captures logged with staff user ID, branch ID, timestamp.
*   Offline captures synced with HMAC integrity verification.

---

## 7. QA Verification Matrix

*   **TC-01**: Complete branch capture with OTP; receipt in Customer Consent Registry.
*   **TC-02**: Offline capture syncs on reconnect without data loss.
*   **TC-03**: Required purposes cannot be toggled off.
*   **TC-04**: Staff user ID recorded in audit trail.
*   **TC-05**: Invalid OTP blocks submission after retry limit.
