# Vajra — Merchant Consent Capture Technical Specification

This document covers the **Merchant Consent Capture** page (`/consent/banking/merchant-capture`) within the Advanced Consent Management cluster.

---

## 1. Module Overview

### 1.1 Purpose
Enable consent capture at **merchant POS terminals** and partner onboarding flows — where a bank's merchant acquirer or payment partner collects customer consent for merchant services, transaction analytics, and marketing communications.

### 1.2 Business Objective
Banks with merchant acquiring businesses need consent at the point of merchant onboarding and customer transaction. This module provides a streamlined capture UI optimized for POS/tablet use.

### 1.3 DPDPA Compliance Objective
*   **Section 6(1)**: Specific consent for merchant-related processing purposes.
*   **Section 6(3)**: Notice presented during merchant onboarding.

---

## 2. Detailed Screen Specification

**Route:** `/consent/banking/merchant-capture`

### 2.1 Capture Flow

**Step 1 — Select Journey**
*   Dropdown of active merchant-channel journeys only
*   Simplified journey list (fewer options than branch)

**Step 2 — Customer Phone**
*   Primary identifier (phone number, E.164)
*   Optional email field (if journey requires)

**Step 3 — Notice & Consent**
*   Compact notice display (mobile-optimized)
*   Purpose toggles (merchant services required; marketing/analytics optional)
*   Single "I Agree" / "Customize" button pattern

**Step 4 — Confirm**
*   Summary and submit
*   Receipt confirmation screen
*   SMS confirmation sent to customer (via configured SMS provider)

### 2.2 POS-Optimized UI
*   Large touch targets for tablet/POS use
*   Minimal steps (3-4 screens max)
*   Works on mobile browsers (responsive)
*   No staff authentication required (merchant self-service)

### 2.3 Merchant Context
Each capture tagged with:
*   Merchant ID (from integration property config)
*   Terminal/location ID (optional)
*   Journey ID and channel = `merchant`

---

## 3. User Journey

1. Merchant staff opens Merchant Consent Capture on tablet.
2. Selects "Merchant Onboarding" journey.
3. Enters customer phone number.
4. Customer reads notice on screen.
5. Customer taps "Agree" (required purposes) or "Customize" (toggle marketing off).
6. Consent submitted; SMS confirmation sent.
7. Receipt visible in Customer Consent Registry.

---

## 4. Relationships

| Module | Relationship |
| :--- | :--- |
| **Journey & Channel Mapping** | Merchant-channel journeys only |
| **Pluggable Provider Adapters** | SMS confirmation via configured provider |
| **Customer Consent Registry** | Receipts tagged with merchant channel |
| **Consent Enforcement** | Merchant consent enforced server-side |

---

## 5. Backend Architecture

*   Same capture session API as branch capture
*   Channel filter: `channel = merchant` in journey config
*   Merchant ID from integration property metadata

---

## 6. QA Verification Matrix

*   **TC-01**: Merchant journey capture creates receipt with channel=merchant.
*   **TC-02**: SMS confirmation delivered via configured provider.
*   **TC-03**: Only merchant-channel journeys shown in selector.
*   **TC-04**: Mobile-responsive UI renders correctly on tablet viewport.
