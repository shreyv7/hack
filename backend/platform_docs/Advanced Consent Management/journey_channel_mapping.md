# Vajra — Journey & Channel Mapping Technical Specification

This document covers the **Journey & Channel Mapping** page (`/consent/banking/journeys`) within the Advanced Consent Management cluster.

---

## 1. Module Overview

### 1.1 Purpose
Define customer interaction **journeys** (e.g., Account Opening, Credit Card Application) and map each journey to specific consent purposes, identifier requirements, notice versions, and capture channels (branch, merchant, mobile, internet banking).

### 1.2 Business Objective
Different banking products and channels require different consent scopes. A credit card application needs marketing consent; a balance inquiry does not. Journey mapping ensures the right consent is collected at the right touchpoint.

### 1.3 DPDPA Compliance Objective
*   **Section 6(1)**: Consent specific to the journey's processing purposes.
*   **Section 6(3)**: Correct notice displayed per journey context.

---

## 2. Detailed Screen Specification

**Route:** `/consent/banking/journeys`

### 2.1 Journey List
Table of configured journeys:
*   Journey name and key
*   Channel (branch, merchant, mobile, internet_banking, atm, call_center)
*   Linked purposes count
*   OTP required badge
*   Status (active/inactive)

### 2.2 Journey Editor
**Basic Settings**
*   Journey name and key (slug)
*   Channel selector
*   Description

**Identifier Requirements**
Per enabled identifier type (from Bank Identifier Settings):
*   Required / Optional / Disabled

**Purpose Mapping**
*   Multi-select from Purpose Registry
*   Per-purpose: required consent / informational only
*   Default consent state (opt-in / opt-out)

**Notice Assignment**
*   Select published consent notice version
*   Preview notice content

**Security Settings**
*   OTP verification required (yes/no)
*   Offline capture allowed (yes/no)
*   Staff authentication required for assisted capture

### 2.3 Example Journeys

| Journey | Channel | Identifiers | Purposes | OTP |
| :--- | :--- | :--- | :--- | :--- |
| Account Opening | Branch | CIF (req), PAN (req), Phone (req) | KYC, Service Delivery, Marketing (opt) | Yes |
| Credit Card Apply | Mobile | Phone (req), Email (opt) | Credit Check, Marketing (opt) | Yes |
| Merchant Onboarding | Merchant | Phone (req) | Merchant Services, Analytics (opt) | No |
| Balance Inquiry | ATM | Account Number (req) | Service Delivery only | No |

---

## 3. User Journey

1. DPO opens Journey & Channel Mapping.
2. Clicks "Add Journey" → names it "Account Opening".
3. Sets channel to "branch".
4. Sets CIF and PAN as required identifiers; email as optional.
5. Links purposes: KYC Verification (required), Account Services (required), Marketing SMS (optional).
6. Assigns published "Account Opening Notice" v2.
7. Enables OTP verification.
8. Saves journey → available in Branch Consent Capture.

---

## 4. Relationships

| Module | Relationship |
| :--- | :--- |
| **Bank Identifier Settings** | Only enabled identifiers available |
| **Purpose Registry** | Purposes linked per journey |
| **Consent Notices Manager** | Notice version assigned per journey |
| **Branch/Merchant Capture** | Journey selector drives capture form |
| **Customer Consent Registry** | Receipts tagged with journey ID |

---

## 5. Backend Architecture

*   **Config**: `ConsentIndustryConfig.journeys` (JSON array of `JourneyConfig`)
*   **Resolver**: `resolve_property_journey()` in `industry_packs.py`
*   **OTP gate**: `journey_requires_otp()` checks journey config before finalize

---

## 6. QA Verification Matrix

*   **TC-01**: Create journey with 3 purposes; branch capture shows 3 purpose toggles.
*   **TC-02**: OTP-required journey blocks finalize without OTP verification.
*   **TC-03**: Disabled identifier not shown in journey form.
*   **TC-04**: Inactive journey not available in capture channel selectors.
