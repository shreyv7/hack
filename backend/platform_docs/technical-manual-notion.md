# DPDPA Shield — Technical & Integration Manual

A hands-on setup and integration guide for the teams that connect DPDPA Shield to your systems: **developers** wiring the consent banner, SDKs, and APIs into your websites and apps, and **IT / DevOps / governance admins** connecting data sources, running assessments, and configuring compliance operations.

> This document is the technical companion to the **User Manual**. The User Manual explains *what each screen is*; this manual explains *how to set it up, how the flow works, and what you achieve* at each step.

---

## How to import into Notion

1. Open a Notion page → **⋯ menu → Import → Markdown** and select this file.
2. Code blocks are fenced so Notion renders them as copyable code — keep the fences intact when editing.
3. Tables have a blank line above them so Notion parses them cleanly.
4. Every **Screenshot** quote block is a placeholder — drop your captured image into that block and delete the placeholder text.
5. Replace any `{PLACEHOLDER}` token with the real value from your workspace (shown in the app).

---

## How to read this manual

Each part opens with a short **"What you'll achieve"** summary and, where useful, a **"How the flow works"** overview, so you always understand *why* you're doing a step before the *how*.

| Reader | Start at |
|--------|----------|
| **Front-end / web developer** | Part 2 — Web Integration |
| **Mobile developer** | Part 3 — Mobile SDK |
| **Back-end / API developer** | Part 4 — Public REST API & Webhooks |
| **IT admin / DevOps** | Part 5 — Data Sources & Scanning |
| **Compliance / platform admin** | Part 6 — Consent & Rights Portal, Part 7 — Governance |

Sections marked **[Dev]** are for engineers; **[IT]** for infrastructure owners; **[Admin]** for compliance/governance owners.

---

## Contents

1. Platform & Access Concepts
2. Web Integration **[Dev]**
3. Mobile SDK Integration **[Dev]**
4. Public REST API & Webhooks **[Dev]**
5. Data Sources & Scanning **[IT]**
6. Consent & Rights Portal Setup **[IT / Admin]**
7. Governance **[Admin / Dev]**
8. Environment, Configuration & Troubleshooting
9. Appendix — Reference Tables & Screenshot Checklist

---

# 1. Platform & Access Concepts

**What you'll achieve:** a clear mental model of how DPDPA Shield plugs into your stack, and the credentials you need before writing any code. Read this first — every later part builds on it.

## 1.1 The building blocks

DPDPA Shield sits between your systems and your end users. You register the surfaces you own (a website, an app), attach a consent experience to them, and the platform records every decision as tamper-evident evidence.

| Concept | What it is | Why it matters |
|---------|-----------|----------------|
| **Organization (workspace)** | Your tenant. Everything below belongs to one organization. | Isolates your data and keys from other customers. |
| **Property** | A single website or mobile app you register. | The unit you install the banner/SDK on; holds its own ID, keys, and banner. |
| **API key** | The credential authorizing requests for a property. Format `zsk_live_…`. | Used in both the browser snippet and server-to-server calls. |
| **Consent banner** | The UI shown to end users. | Built once in the app, then *attached* to one or more properties. |
| **CMP script (`cmp.js`)** | The small JavaScript the browser loads. | Renders the banner, blocks trackers until consent, and records receipts. |
| **Deployment** | A registered target of a property (e.g. an iOS build). | Mobile SDKs authenticate against a deployment. |
| **Proof Vault** | Cryptographically chained consent receipts. | Court-admissible evidence that consent was collected. |

**How the flow works, end to end:**

1. Register a **property** for your site/app.
2. Build a **consent banner** and **attach** it to the property.
3. Install the **CMP script** (or SDK) using the property's **ID + API key**.
4. On each visit, the script **fetches config**, **renders the banner**, and **blocks tagged trackers** until the user chooses.
5. Each choice is **recorded** to the public API, **sealed** into the Proof Vault, and (optionally) **pushed to your webhook**.

## 1.2 Environments & base URLs

Use these production values. Your exact Public API base is also printed in **Integrations → API & Webhooks** and embedded as `data-api-url` in your generated snippet.

| Name | Production URL |
|------|----------------|
| **App (dashboard)** | `https://dpdplawshield.zeroshield.ai` |
| **CMP script** | `https://dpdplawshield.zeroshield.ai/cmp.js` |
| **Public API base** (`{API_BASE}`) | `https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1` |
| **Public rights portal** | `https://dpdplawshield.zeroshield.ai/portal/{ORG_SLUG}` |

Throughout this manual, `{API_BASE}` means the Public API base above.

## 1.3 Deployment models **[IT]**

Record your hosting model under **Settings → Deployment Settings** for audit purposes — it appears in your compliance evidence.

| Model | Notes |
|-------|-------|
| **Public Cloud** | Managed multi-tenant hosting. Fastest to start. |
| **Private** | Dedicated single-tenant instance. |
| **Hybrid** | Control plane hosted; data connectors run against your infrastructure. |
| **On-Premises** | Runs inside your own environment. |

> **Screenshot** — Settings → Deployment Settings: the deployment-model selector (Public Cloud / Private / Hybrid / On-Prem), data-residency region, and backup/DR fields.

## 1.4 Authentication model

There is **one credential** — the property API key (`zsk_live_…`) — used two ways:

- **In the browser** (`data-api-key` in the install snippet). Because this is visible to end users, browser traffic is additionally protected by a **per-property origin allowlist** and short-lived session tokens.
- **Server-to-server** (the `X-Api-Key` request header). Never expose this in client-side code you don't control.

**Key rules you must plan around:**

- The **full key is shown only once**, when you create or rotate it. Copy it into your secret manager immediately. Afterwards only the **prefix** (first 13 chars, e.g. `zsk_live_ab12`) is visible.
- **Rotate** keys from the property's **API Keys** tab: generate a new key, deploy it, then revoke the old one. Revoked keys stop working immediately.
- **Origin allowlist:** add every domain that will host the banner (supports `*.example.com` wildcards). `localhost` / `127.0.0.1` are always allowed for testing.

> **Screenshot** — Integrations → property → API Keys: the "generate key" dialog showing the full key revealed once, with the copy button and the "store this now" warning.

## 1.5 Rate limits

Public browser endpoints are rate-limited per client. Design retries with backoff.

| Endpoint | Limit |
|----------|-------|
| `POST …/{property_id}/token` | 30 / min |
| `GET …/{property_id}/config` | 60 / min |
| `POST …/{property_id}/events` | 120 / min |
| `POST …/{property_id}/consent` | 120 / min |

Server-to-server APIs (children's data, retention) are not fixed-rate but should be called at reasonable volumes.

---

# 2. Web Integration **[Dev]**

**What you'll achieve:** a live consent banner on your site that automatically blocks non-essential cookies and trackers until the visitor consents, records every decision as evidence, and keeps your analytics/marketing tags compliant — with a few lines in your `<head>`.

**How the flow works:**

1. Register the website **property** and generate an **API key**.
2. **Attach a banner** to the property.
3. Paste the **install snippet** into your `<head>` and **tag** third-party scripts.
4. The CMP renders the banner, holds tagged tags until consent, and posts receipts.
5. **Verify** the install and watch consents arrive.

## 2.1 Prerequisites

- A registered **website property** (Integrations → Website → *Add Property*). Note its **Property ID** and generate an **API key**.
- A **consent banner** built and **attached** to that property (Consent Management → Create Consent). Without an attached banner the script loads a minimal fallback and shows nothing to block.
- The serving domains added to the property's **origin allowlist**.

> **Screenshot** — Integrations → Website: the property list with a registered domain, status, and the **Add Property** button.

## 2.2 Step 1 — Install the CMP script (HTML)

Paste this as high in the `<head>` as possible, before any third-party tags. The app generates this exact snippet for you under **Integrations → property → Install**.

```html
<script async src="https://dpdplawshield.zeroshield.ai/cmp.js"
  data-property-id="{PROPERTY_ID}"
  data-api-key="{YOUR_API_KEY}"
  data-banner-id="{BANNER_ID}"
  data-api-url="https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1"
  data-language="auto"
  data-blocker-mode="strict"
  integrity="{SRI_HASH}"
  crossorigin="anonymous">
</script>
```

> **Screenshot** — Integrations → property → Install tab: the generated HTML snippet with the framework switcher (HTML / React / Next.js / Vue / Angular / GTM / WordPress) and the **Copy** button.

### Data attribute reference

| Attribute | Required | Purpose |
|-----------|----------|---------|
| `data-property-id` | Yes | The property this page belongs to |
| `data-api-key` | Yes | Your `zsk_live_…` key |
| `data-api-url` | Yes | The Public API base (`{API_BASE}`) |
| `data-banner-id` | Optional | Pin a specific banner; omit to use the property's active banner |
| `data-language` | Optional | `auto` (detect from browser/geo) or a language code such as `en`, `hi`, `mr` |
| `data-blocker-mode` | Optional | `strict` (default) blocks non-essential tags until consent |
| `integrity` / `crossorigin` | Recommended | Subresource Integrity pinning; use the values from your snippet |

## 2.3 Step 2 — Tag third-party scripts for auto-blocking

This is the step that makes you compliant: mark every tag that must wait for consent with `data-zs-purpose`. The CMP holds it until the visitor grants that purpose, then loads it automatically.

```html
<!-- Loads only after "analytics" consent -->
<script type="text/plain" data-zs-purpose="analytics"
        src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>

<!-- Loads only after "marketing" consent -->
<script type="text/plain" data-zs-purpose="marketing" src="https://connect.facebook.net/…/fbevents.js"></script>
```

Note the `type="text/plain"` — that stops the browser from running the tag until the CMP releases it. Common purpose keys: `necessary` (always on), `analytics`, `marketing`, `functional`; the exact keys come from your **Purpose Registry**.

## 2.4 Step 3 — React to consent in your own code

For logic you control (not `<script>` tags), read consent directly. The script exposes a global `ZeroShield` object and fires an event whenever consent changes.

```javascript
// One-off check
if (window.ZeroShield && window.ZeroShield.hasConsent('analytics')) {
  // safe to initialize analytics
}

// Live updates (fires when the visitor accepts, rejects, or changes preferences)
window.addEventListener('zeroshield_consent_changed', function (event) {
  const purposes = event.detail.purposes; // { necessary: true, analytics: true, marketing: false }
  if (purposes.marketing) {
    // fire marketing tags
  }
});
```

## 2.5 Framework notes

The CMP is a **standalone browser script** — there is no framework package to install. In every framework you load the same `cmp.js` with the same `data-*` attributes; only *where you put it* differs. Generate the exact snippet under **Install** on the property page.

**React / Vue / Angular (SPA)** — the simplest and recommended approach is to put the HTML snippet from 2.2 into your app's HTML shell (`index.html` / `public/index.html`) inside `<head>`. It loads once for the whole app, and you read consent anywhere via the global `window.ZeroShield` API (see 2.4).

If you must load it from component code instead, inject it once:

```javascript
// Run once at app startup (e.g. React useEffect([]), Vue onMounted, Angular ngOnInit)
if (!document.getElementById('zeroshield-cmp')) {
  const s = document.createElement('script');
  s.id = 'zeroshield-cmp';
  s.async = true;
  s.src = 'https://dpdplawshield.zeroshield.ai/cmp.js';
  s.setAttribute('data-property-id', '{PROPERTY_ID}');
  s.setAttribute('data-api-key', '{YOUR_API_KEY}');
  s.setAttribute('data-api-url', 'https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1');
  s.setAttribute('data-language', 'auto');
  s.setAttribute('data-blocker-mode', 'strict');
  // s.setAttribute('data-banner-id', '{BANNER_ID}'); // optional
  document.head.appendChild(s);
}
```

**Next.js** — load it with `next/script` in `app/layout.tsx` (or `pages/_document.js`):

```jsx
import Script from 'next/script';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://dpdplawshield.zeroshield.ai/cmp.js"
          strategy="afterInteractive"
          data-property-id="{PROPERTY_ID}"
          data-api-key="{YOUR_API_KEY}"
          data-api-url="https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1"
          data-language="auto"
          data-blocker-mode="strict"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

**WordPress** — paste the HTML snippet from 2.2 into your active theme's `header.php` inside `<head>` (or use a "header scripts" plugin).

## 2.6 Tag Manager & Consent Mode v2

If you manage tags through GTM, you don't need to touch page code — enforce consent inside GTM instead.

- Import the ready-made ZeroShield template: **Templates → Tag Templates → Import** using `{API_BASE}/integrations/gtm/template.tpl`.
- Create a tag from *ZeroShield Consent Banner* and set your **Property ID** and **API Key**.
- With **Google Consent Mode v2**, the CMP updates `analytics_storage` / `ad_storage` signals as the visitor consents. Configure the mapping under **Integrations → Tag Manager**. **Matomo** is supported from the same screen.

> **Screenshot** — Integrations → Tag Manager: the GTM / Matomo / Consent Mode v2 configuration panel with the tag-blocking rules.

## 2.7 Step 4 — Verify the installation

- **Automatic check:** on the property page click **Verify** — the platform fetches your page and confirms the script is present (`snippet_detected`).
- **Coverage scan:** run **Coverage Scan** to crawl your pages and report where the banner is or isn't detected.
- **Manual check:** open the site, accept/reject, and confirm tagged tags fire only after consent. The decision should appear under **Consent Management → Received Consents**.

> **Screenshot** — Integrations → property → Verify: a successful verification showing "snippet detected" and the coverage result.

---

# 3. Mobile SDK Integration **[Dev]**

**What you'll achieve:** a native consent screen shown on app launch — before any telemetry initializes — with consent recorded as evidence exactly like web. Supported platforms: **iOS, Android, React Native, Flutter**.

The mobile integration is **REST-based**: your app calls the three endpoints below (from any native HTTP client) — there is no library to install. Authenticate every call with `X-Api-Key`.

**How the flow works:**

1. Register a **mobile property** and generate an API key.
2. Register a **deployment** for the build → get a `deployment_id`.
3. On launch, your app **fetches config** (`GET …/sdk/config/{deployment_id}`), **presents a native consent screen** built from the returned banner + purposes, then **posts the decision** (`POST …/sdk/consent`).
4. Optionally send a **heartbeat** (`POST …/sdk/heartbeat/{deployment_id}`) for live deployment health.

Present the consent screen **before** initializing third-party SDKs (Firebase, Meta, etc.).

> **Screenshot** — Integrations → Mobile SDK: the app property list with platform icons (iOS, Android, React Native, Flutter) and per-platform install instructions.

## 3.1 Fetch deployment config

```bash
curl -X GET "{API_BASE}/integrations/sdk/config/{DEPLOYMENT_ID}" \
  -H "X-Api-Key: {YOUR_API_KEY}"
```

Returns the platform, blocker mode, default language, the active **banner** (styling + copy + translations), and the **purposes** to present.

## 3.2 Record a consent decision

```bash
curl -X POST "{API_BASE}/integrations/sdk/consent" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "property_id": "{PROPERTY_ID}",
    "deployment_id": "{DEPLOYMENT_ID}",
    "session_id": "device-session-abc",
    "consented_purposes": ["necessary", "analytics"],
    "language": "en",
    "device_info": "iPhone 15; iOS 18.2"
  }'
```

## 3.3 Send a heartbeat (optional)

```bash
curl -X POST "{API_BASE}/integrations/sdk/heartbeat/{DEPLOYMENT_ID}" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "sdk_version": "4.2.0", "app_version": "1.0.0" }'
```

Each recorded consent is stored as a receipt and sealed into your Proof Vault, exactly like web consent.

---

# 4. Public REST API & Webhooks **[Dev]**

**What you'll achieve:** direct, server-to-server control over consent, children's-data enforcement, and data-erasure obligations — so your own back-end systems stay in step with what the platform records. Everything here is server-side; all examples use `{API_BASE}`.

## 4.1 Authentication recap

| Auth | Used by | Header |
|------|---------|--------|
| **Property API key** | CMP config/events/consent, mobile SDK | `X-Api-Key: {YOUR_API_KEY}` |
| **Session token** (Bearer) | Browser CMP after token exchange | `Authorization: Bearer {SESSION_TOKEN}` |
| **Organization API key** | Children's Data & Retention APIs | `X-Api-Key: {YOUR_API_KEY}` (any active key for your org) |

> **Screenshot** — Integrations → API & Webhooks (Developer Console): the API-keys list, webhook endpoints, and the copy-paste cURL examples.

## 4.2 Endpoint reference

**Consent / CMP (property-scoped)**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/integrations/{property_id}/token` | Exchange an API key for a 30-min session token |
| GET | `/integrations/{property_id}/config` | Fetch banner + purposes + translations + blocking rules |
| POST | `/integrations/{property_id}/events` | Record a UI event (impression, interaction) |
| POST | `/integrations/{property_id}/consent` | Save a consent receipt |
| GET | `/integrations/cmp.js` | The CMP script bundle |

**Mobile SDK (property/deployment-scoped)**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/integrations/sdk/config/{deployment_id}` | SDK config |
| POST | `/integrations/sdk/heartbeat/{deployment_id}` | Deployment heartbeat |
| POST | `/integrations/sdk/consent` | Save a mobile consent receipt |

**Children's Data — DPDPA Section 9 (org-scoped)**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/childrens-data/enforce` | Ask whether a purpose is allowed for a subject |
| POST | `/childrens-data/consent` | Record a parental-consent decision |

**Retention obligations (org-scoped)**

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/retention/events` | Report a lifecycle event → creates an erasure obligation |
| GET | `/retention/due` | List obligations whose erasure is now due |
| POST | `/retention/obligations/{id}/fulfill` | Confirm you purged the subject |

## 4.3 Token exchange → config → consent (web, server-assisted)

```bash
# 1) Exchange key for a short-lived session token
curl -X POST "{API_BASE}/integrations/{PROPERTY_ID}/token" \
  -H "Content-Type: application/json" \
  -d '{ "api_key": "{YOUR_API_KEY}", "origin": "https://www.example.com" }'
# → { "session_token": "…", "token_type": "Bearer", "expires_in": 1800, ... }

# 2) Fetch config (either header works)
curl -X GET "{API_BASE}/integrations/{PROPERTY_ID}/config?lang=en" \
  -H "Authorization: Bearer {SESSION_TOKEN}"

# 3) Record consent
curl -X POST "{API_BASE}/integrations/{PROPERTY_ID}/consent" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "web-session-xyz",
    "consented_purposes": { "necessary": true, "analytics": true, "marketing": false },
    "language": "en",
    "principal_email": "user@example.com"
  }'
```

`principal_email` / `principal_phone` are optional — supply them to email/SMS the visitor a copy of their consent.

## 4.4 Children's Data enforcement API

**Why:** DPDPA Section 9 forbids profiling and targeted advertising of minors and requires verifiable parental consent to process their data. Call `enforce` **before** you process a person, and honour the answer.

```bash
# Is this purpose allowed for this subject?
curl -X POST "{API_BASE}/childrens-data/enforce" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "subject_ref": "user-12345", "purpose": "ad_targeting" }'
```

Response:

```json
{
  "allowed": false,
  "purpose": "ad_targeting",
  "matched": true,
  "is_minor": true,
  "consent_status": "missing",
  "reason": "Targeted advertising is blocked for a minor under DPDPA Section 9."
}
```

`purpose` is one of `processing`, `profiling`, `ad_targeting`. `subject_ref` is any stable identifier you already store (it matches on `external_ref` or `child_ref`). Unknown subjects return `allowed: true` (no record on file).

Record a parental-consent decision you collected on your side (e.g. via DigiLocker or your own form):

```bash
curl -X POST "{API_BASE}/childrens-data/consent" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_ref": "user-12345",
    "decision": "grant",
    "parent_name": "A. Sharma",
    "parent_email": "parent@example.com",
    "parent_relationship": "Mother",
    "verification_method": "DigiLocker",
    "date_of_birth": "2014-06-01",
    "consent_validity_days": 365
  }'
```

> Verification is **your** responsibility. This API stores the decision and evidence; it does not itself verify identity.

## 4.5 Retention obligation API

**Why:** when a person withdraws consent or an account closes, the law expects their data to be erased on a schedule. This API lets your own systems drive that erasure with a clean audit trail.

```bash
# 1) Report a lifecycle event (e.g. consent withdrawn)
curl -X POST "{API_BASE}/retention/events" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "subject_ref": "user-12345",
    "trigger_event": "consent_withdrawal",
    "data_category": "marketing_profile",
    "purpose": "marketing"
  }'
# → obligation with due_at

# 2) Poll what is due now
curl -X GET "{API_BASE}/retention/due" -H "X-Api-Key: {YOUR_API_KEY}"

# 3) After purging in your systems, confirm (evidence is stored for audit)
curl -X POST "{API_BASE}/retention/obligations/{OBLIGATION_ID}/fulfill" \
  -H "X-Api-Key: {YOUR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "evidence": { "rows_deleted": 42, "systems": ["crm", "warehouse"] }, "fulfilled_by": "erasure-worker" }'
```

## 4.6 Consent webhooks

**Why:** get consent decisions pushed to your endpoint in real time, so your CRM/CDP updates the instant a visitor changes preferences.

**Setup:** attach an active banner to the property, then set the webhook URL under **Integrations → property → Webhooks** (or the banner's *Consent Webhook URL*). Delivery attempts are logged under the property's **Webhook Deliveries**.

**When it fires:** on every consent receipt for that property.

**Example payload:**

```json
{
  "property_id": "{PROPERTY_ID}",
  "organization_id": "…",
  "banner_id": "{BANNER_ID}",
  "receipt_id": "…",
  "session_id": "web-session-xyz",
  "consented_purposes": { "necessary": true, "analytics": true, "marketing": false },
  "language": "en",
  "principal_email": "user@example.com",
  "is_test": false
}
```

Respond `2xx` to acknowledge. Verify the source and treat `receipt_id` as the idempotency key.

> **Screenshot** — Integrations → property → Webhooks: the webhook URL field and the delivery log showing status codes and timestamps for recent attempts.

---

# 5. Data Sources & Scanning **[IT]**

**What you'll achieve:** a live map of where personal data lives across your systems, automatic classification of that data (email, phone, PAN, Aadhaar, and more), and the ability to mask, anonymise, and expire it — turning "we think we're compliant" into evidence you can show a regulator.

**How the flow works:** **Connect** a source → **Inventory** its structure → **Scan** for PII → **Protect** (mask/anonymise) → **Retain** (expire on schedule).

## 5.1 Network & security prerequisites

- **Reachability:** the platform must be able to reach the store you connect. For databases behind a firewall, allowlist the platform's egress — or use the Hybrid/On-Prem deployment model so connectors run inside your network.
- **Least privilege:** create a dedicated **read-only** account for scanning; grant delete rights only if you want the platform to execute retention deletions.
- **Credentials at rest:** connection secrets (passwords, keys, tokens) are **encrypted**; the password is never returned by the API — the app only reports whether one is set.

## 5.2 Connector catalog

Pick a **category**, then a **connector**. The connection fields adapt to the category.

| Category | Connectors | Typical fields |
|----------|-----------|----------------|
| **Database** | PostgreSQL, MySQL, MariaDB, MongoDB, Oracle, SQL Server, SQLite, Other DB | host, port, database, username, password, SSL |
| **Cloud** (managed DB) | AWS RDS, Azure SQL, Google Cloud SQL, MongoDB Atlas, Self-Hosted, Other | endpoint/host, port, database, username, password, region, SSL + engine |
| **Files** (object storage) | AWS S3, Azure Blob, Google Cloud Storage, Google Drive, SFTP/FTP | bucket/container/path, region, access key/account, secret |
| **API** | REST, GraphQL, SOAP, Other | base URL, auth header name, token/secret |
| **Logs** | AWS CloudWatch, Azure Monitor, GCP Logging, Splunk | log group/index/endpoint, region, key/token |
| **Upload** | Direct file upload (max 50 MB) | — drag & drop the file |

> **Screenshot** — Data Protection → Data Sources → Add Source: the two-step modal (category cards → connector chips + connection fields, or the drag-drop upload zone).

### Connector-specific notes

| Connector | Setup detail |
|-----------|--------------|
| **Oracle** | "Database name" = the Oracle **service name**. |
| **SQLite** | Put the database **file path** in the "Database name" field. |
| **Other DB / AWS RDS / GCP SQL / Self-Hosted** | Choose the underlying **engine** (PostgreSQL/MySQL/MariaDB/SQL Server/Oracle/MongoDB). |
| **Azure SQL** | Host = `server.database.windows.net` (SQL Server engine). |
| **MongoDB Atlas** | Host = cluster host `xxxx.mongodb.net` (connects via SRV). |
| **AWS S3** | Bucket in the host field; region required. Advanced (JSON): `endpoint_url` (MinIO), `session_token`. |
| **Azure Blob** | Account name = username, account key = password — or set `connection_string` in Advanced. |
| **Google Cloud Storage / Logging** | Paste the **service-account JSON** in Advanced (`service_account_json`). |
| **Google Drive** | In Google Cloud Console: create a project, enable the Drive API, create OAuth 2.0 credentials, obtain a refresh token, then enter **Client ID + Client Secret + Refresh Token**. |
| **SFTP** | Advanced: `path` (remote dir), `private_key` (PEM). |
| **REST** | Token sent as Bearer by default. For PII scanning, set Advanced `scan_paths` (e.g. `["/users","/orders"]`) to the JSON endpoints to read. |
| **Splunk** | Host = `https://host:8089`; token = password, or set username for basic auth. |
| **Azure Monitor** | Advanced: `tenant_id`, `client_id`, `workspace_id`; client secret = password. |

Anything you put in the per-connector **Advanced configuration (JSON)** box is merged into the connection config.

## 5.3 Connect a database (step by step)

1. **Data Protection → Data Sources → Add Source.**
2. Choose category **Database** (or **Cloud** for a managed service) and the connector.
3. Fill host, port, database, username, password; toggle SSL as needed.
4. **Test Connection.** Green means the platform reached it; on failure `last_error` explains why (credentials, network, egress).
5. **Scan schema** to import tables/columns into the **Data Inventory**.

> **Screenshot** — Data Sources: a connected source card showing the green "connected" status, category badge, and the **Scan schema** / **Test Connection** actions.

## 5.4 Upload a file

Use category **Upload** to drag in a `.csv`, `.tsv`, `.xlsx`, `.json`, `.txt`, `.log`, `.pdf`, or `.docx` (≤ 50 MB). Uploaded files can be PII-scanned directly — useful for one-off assessments without a live connection.

## 5.5 The scanning pipeline

Run these in order from Data Protection:

1. **Import schema / inventory** — populates the Data Inventory with assets and fields (first-pass classification by column name).
2. **PII Scanner** — samples real values and classifies columns (email, phone, PAN, Aadhaar, UPI, IFSC, and more), updating the inventory with data-verified classifications.
3. **Data Masking** — define per-category rules (mask/redact/hash/tokenize); preview on real data, then optionally apply in place.
4. **Retention Policies** — set retention per category/asset; run a safe **dry-run** first, then execute deletion or anonymisation on confirmation.

> **Screenshot** — Data Protection → PII Scanner: the results table with columns flagged by PII category and the category donut chart.

## 5.6 What each source type supports

| Source type | Auto-inventory | PII scan | Masking | Retention |
|-------------|:---:|:---:|:---:|:---:|
| Databases (Postgres, MySQL, Maria, Mongo, Oracle, SQL Server, SQLite) | ✓ | ✓ | ✓ | ✓ |
| Cloud managed DBs (RDS, Azure SQL, Cloud SQL, Atlas…) | ✓ | ✓ | ✓ | ✓ |
| File stores (S3, GCS, Azure Blob, Google Drive, SFTP) | ✓ | ✓ | — | — |
| Uploaded files | ✓ | ✓ | — | — |
| Logs (CloudWatch, Azure Monitor, GCP Logging, Splunk) | — | ✓ | — | — |
| APIs (REST) | — | ✓ | — | — |

Masking and retention run in place, so they apply to reachable SQL/document databases; file, log, and API sources are read-only for scanning.

---

# 6. Consent & Rights Portal Setup **[IT / Admin]**

**What you'll achieve:** the supporting configuration behind the banner — delivery channels for out-of-band consent, a cookie inventory that keeps blocking accurate, and a public portal where data principals exercise their rights.

## 6.1 Provider adapters

Register the external providers used for out-of-band notice delivery and campaigns (SMS gateway, email service, database) under **Consent Management → Pluggable Provider Adapters**. Configure these **before** notice delivery channels.

> **Screenshot** — Consent Management → Pluggable Provider Adapters: the adapter list and the add/configure dialog (SMS, email, database).

## 6.2 Notice delivery channels

Under **Consent Management → Notice Delivery Channels**, wire email / SMS / in-app channels to the provider adapters above. This lets you collect consent outside the web banner (email campaigns, SMS prompts).

## 6.3 Banner lifecycle

1. Build a banner (Create Consent → New Banner): choose purposes, template, and blocker mode.
2. **Attach** it to one or more properties.
3. Add **translations** (Multi-Language Editor) for Schedule VIII languages.
4. Deploy the property snippet/SDK; monitor **Received Consents** and verify the **Proof Vault** chain.

## 6.4 Cookie scanner

From **Cookie & Tracker Manager**, run the scanner against a domain to discover cookies and third-party trackers, categorize them (essential/analytics/marketing), and map them to purposes so the CMP blocks them correctly.

> **Screenshot** — Consent Management → Cookie & Tracker Manager: the discovered cookies/trackers table with categories and the **Scan** action.

## 6.5 Public Rights Portal

Configure your public portal under **Data Principal Rights → Rights Portal**: branding, which rights you accept (access, correction, erasure, grievance), form fields, and OTP settings. The hosted portal is available at:

```
https://dpdplawshield.zeroshield.ai/portal/{ORG_SLUG}
```

Identity is verified by **OTP** before a request is logged into the DSAR SLA Tracker.

> **Screenshot** — Data Principal Rights → Rights Portal: the admin configuration panel (branding, accepted rights, OTP settings) with the live portal preview.

**Building a custom portal front-end (optional, [Dev]).** The portal is backed by public (unauthenticated) endpoints on the app host, keyed by your org slug:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/dsar/portal/{ORG_SLUG}/branding` | Portal branding |
| GET | `/api/dsar/portal/{ORG_SLUG}/forms/{right_type}` | Form schema for a right |
| POST | `/api/dsar/portal/{ORG_SLUG}/requests` | Submit a request |
| POST | `/api/dsar/portal/{ORG_SLUG}/requests/{tracking_id}/verify-otp` | Verify the OTP |
| POST | `/api/dsar/portal/{ORG_SLUG}/requests/{tracking_id}/resend-otp` | Resend the OTP |
| POST | `/api/dsar/portal/{ORG_SLUG}/requests/{tracking_id}/status-check` | Check request status |

## 6.6 Consent withdrawal

Configure withdrawal (Consent Management → Consent Withdrawal Flow) so it mirrors the granularity of the original grant (DPDPA Sec 6(4)), and link it from the public portal.

---

# 7. Governance **[Admin / Dev]**

**What you'll achieve:** the accountability layer DPDPA expects of a Data Fiduciary — a living record of what you process and why (RoPA), risk assessments for high-risk processing (DPIA), a managed policy library, third-party (processor) risk control, cross-border transfer governance, a security-controls command center, and board-ready dashboards. This is where you produce the evidence a regulator or auditor asks for.

> Most governance modules share the same operating pattern: **draft → review/approve → publish**, with **version history** and an **immutable activity log** on every record, so you can always show who changed what and when.

## 7.1 Governance Guide

Start at **Governance → Governance Guide** — a module-by-module map with a "who uses what" persona table (DPO, CISO, Legal Counsel). Use it to decide which roles own which module before you populate data.

> **Screenshot** — Governance → Governance Guide: the module map and the persona ("Who Uses What") table.

## 7.2 RoPA — Record of Processing Activities

**What it is & why:** DPDPA and global privacy law expect you to maintain a register of every processing activity — its purpose, legal basis, data categories, retention, and the systems/vendors involved. This is your single source of truth for accountability.

**How the flow works:**

1. **Model your org** — create Business Units → Departments → Teams (used for ownership and Data-Steward scoping).
2. **Populate activities** — either write them manually, or use **AI discovery**: run a **scan** that inspects your Data Inventory and proposes activities; **accept** a suggestion to turn it into a draft record, or **dismiss** it.
3. **Review & approve** — **submit** an activity for approval; approvers record a **decision**; then **publish** it live.
4. **Maintain** — **check out** a draft version to edit, **compare** versions, **roll back** if needed, and **deprecate/archive/restore** as processing changes.

**What you achieve:** an always-current, versioned RoPA you can export for audits, with AI keeping it in sync with the data you actually hold.

> **Screenshot** — Governance → RoPA Module: the activities table with lifecycle status badges (Draft / Pending / Published), the AI **discovery suggestions** panel, and the version-history control.

## 7.3 DPIA — Data Protection Impact Assessment

**What it is & why:** for high-risk processing (large-scale, sensitive, or novel), you must assess the risk to individuals and document mitigations. The DPIA module runs that assessment as a guided, evidenced workflow.

**How the flow works:**

1. **Create a DPIA** — from scratch or a **template**; link the **assets** and draw the **data-flow**.
2. **Answer the questionnaire** — step-by-step; the **rule engine** (Evaluate Rules) flags likely risks, and **Evaluate Compliance** checks your answers against DPDPA obligations.
3. **Assess risks** — add risks with likelihood/impact, then attach **controls** from the control library and **verify** them; residual risk recalculates.
4. **Use AI (optional)** — **Analyze** the case for suggested risks and **Recommendations** for mitigations; pull in PII **scanner results**.
5. **Evidence & approve** — upload **evidence**, add **comments**, **submit** for approval, and record the **decision**.
6. **Export** — generate a **PDF** of the completed DPIA for your records.

**What you achieve:** defensible, repeatable impact assessments with inherent-vs-residual risk, verified controls, and a signed, exportable report.

> **Screenshot** — Governance → DPIA Module: an open case showing the risk matrix (likelihood × impact), the linked controls with verify status, and the **Export PDF** button.

## 7.4 Policy Manager

**What it is & why:** your privacy, cookie, and employee-facing policies must be authored, reviewed, published, and — for internal policies — acknowledged by staff. This module manages that lifecycle and the acknowledgement evidence.

**How the flow works:**

1. **Create a policy** (Privacy, Cookie, Employee, …) — optionally use **AI generation** to draft from a template.
2. **Draft → Review → Publish** — move the policy through its lifecycle; each publish creates a **version**, and previous versions stay in history.
3. **Track acknowledgements** — for internal policies, see who has acknowledged and **send reminders** to those who haven't.
4. **Maintain** — **archive/unarchive** superseded policies; every change is logged under **Activities**.

**What you achieve:** a governed policy library with published versions and provable staff acknowledgement — exactly what an audit asks for.

> **Screenshot** — Governance → Policy Manager: the policies list with Draft/Review/Live status badges and the acknowledgement-tracking column.

## 7.5 Vendor Risk Intelligence

**What it is & why:** processors (vendors) that handle personal data on your behalf are part of your compliance perimeter. You must know who they are, assess their risk, and have a Data Processing Agreement (DPA) with each.

**How the flow works:**

1. **Discover vendors** — run a **scan** that surfaces processors from your data flows and trackers; **investigate** a discovered vendor (Shield AI compiles a GRC snapshot), or **block** one to disable its trackers.
2. **Assess** — **trigger** an assessment questionnaire to the vendor contact and record the **submitted** answers; the vendor gets a **risk score**.
3. **Govern the relationship** — track **DPA status**, link supporting **evidence**, and review the vendor's **data flows**.

**What you achieve:** a scored vendor register with DPA tracking and evidence — so third-party risk is visible and controllable, not a blind spot.

> **Screenshot** — Governance → Vendor Risk Intelligence: the vendor list with risk scores and DPA status, plus the **discovered vendors** panel.

## 7.6 Cross-Border Transfer

**What it is & why:** DPDPA Section 16 governs transfers of personal data outside India. You must register each transfer, document its legal mechanism, hold the contract, and flag transfers to restricted ("negative-list") destinations.

**How the flow works:**

1. **Register a transfer** — destination country, data categories, and the **legal mechanism**; negative-list destinations are flagged automatically.
2. **Attach contracts** — create the transfer's **contract**, manage **versions**, **sign** a version, and export the signed **PDF**.
3. **Notices & SDF** — run **notice campaigns** tied to the transfer and record **SDF (Significant Data Fiduciary) assessments** where required.
4. **Audit** — every action is captured under the transfer's **activities**.

**What you achieve:** a defensible cross-border register with signed contracts and automatic risk flags for restricted destinations.

> **Screenshot** — Governance → Cross-Border Transfer: the transfer registry with destination, legal mechanism, DPA/contract status, and negative-list flags.

## 7.7 CISO Command Center

**What it is & why:** DPDPA Section 8(5) requires reasonable security safeguards. The CISO Command Center is the GRC control room for tracking those safeguards against a benchmark (CIS-style), attaching evidence, managing risk and remediation, and reporting to the board.

**How the flow works:**

1. **Track controls** — work the **controls** library and your **organization controls**; record **reviews**, **comments**, and **exceptions**; link controls to **assets** and **policies**.
2. **Evidence** — upload control **evidence** (documents) and download it for auditors.
3. **Risk & remediation** — log **risks** and manage **remediation tasks** to closure.
4. **Assets & scanning** — register **security assets** and **trigger vulnerability scans**, viewing the **scan logs**.
5. **Score & settings** — tune **score settings** (weighting) and watch the posture **analytics** (score over time) and the **benchmark matrix**.
6. **Board reporting** — **generate** a board report and **download** it as a PDF.

**What you achieve:** a continuously-scored security posture with control evidence, a live remediation queue, and one-click board reports.

> **Screenshot** — Governance → CISO Command Center: the GRC dashboard with CIS benchmark scores, the control-evidence panel, and the **Export Board PDF** button.

## 7.8 Compliance Dashboards

**What it is & why:** stakeholders — executives, auditors, regulators — need visibility without platform logins. The dashboard builder lets you assemble metrics and share them safely.

**How the flow works:**

1. **Build** — create a dashboard from a **template** or blank, add **widgets** from the catalog (compliance score, module health, DSAR stats, etc.), and arrange the **layout**. Every save creates a **version**; **clone** or **favourite** dashboards as needed.
2. **Assist with AI (optional)** — use **AI assist / analyze** to suggest widgets or summarize the data.
3. **Share three ways:**
   - **Internal share** — grant named colleagues access.
   - **Public link** — mint a secure **token** URL for external viewers (read-only, no login): `/compliance/dashboards/public/{token}`. Revoke it any time.
   - **Scheduled delivery** — set a **schedule** to email the dashboard (PDF) automatically on a cadence.
4. **Export** — generate a one-off **PDF** export.

**Who can share/schedule:** Org Admin, Compliance Officer, DPO. Other roles can build personal dashboards but cannot mint public links.

**What you achieve:** board-ready, auto-delivered compliance reporting and safe, revocable external sharing — without handing out platform access.

> **Screenshot** — Governance → Compliance Dashboards: the drag-and-drop widget builder with the **Share** dialog (internal / public link / schedule) open.

---

# 8. Environment, Configuration & Troubleshooting

## 8.1 Pre-launch checklist

- [ ] Property created; API key generated and stored in a secret manager
- [ ] All serving domains added to the property's **origin allowlist**
- [ ] Banner built, translated, and **attached** to the property
- [ ] CMP script in `<head>`; third-party tags marked with `data-zs-purpose`
- [ ] Installation **verified** (snippet detected) and a test consent visible in Received Consents
- [ ] Webhook URL set (if used) and a test delivery confirmed
- [ ] Data sources connected with least-privilege accounts; test connection green
- [ ] Public rights portal branded and OTP tested
- [ ] Governance owners assigned (RoPA, DPIA, Policy, Vendor, CISO per the persona table)

## 8.2 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `401 Missing API Key or Session Token` | No `X-Api-Key` / `Authorization` header sent | Add the header |
| `401 Invalid API Key` | Wrong, rotated, or revoked key | Use the current full key; rotate if lost |
| `403 Origin '…' is not authorized` | Serving domain not on the allowlist | Add the domain (supports `*.example.com`) |
| `401 Invalid or expired session token` | Session token older than 30 min | Re-exchange via the `/token` endpoint |
| `429` responses | Rate limit hit | Back off and retry (see 1.5) |
| Banner never appears | No active banner attached, script not in `<head>`, or property inactive | Attach a banner; move the snippet up; check property status |
| Tags fire before consent | Missing `data-zs-purpose` / not in strict mode | Tag the scripts; confirm `data-blocker-mode="strict"` |
| Webhook not firing | No active banner or no webhook URL | Attach a banner, set the URL, check Webhook Deliveries |
| Data source "connection failed" | Network egress blocked or bad credentials | Allowlist egress; verify credentials; read `last_error` |
| Public dashboard link 404 | Link revoked or never minted | Re-mint the public link from the dashboard's Share dialog |

## 8.3 Security notes for your team

- Treat the `zsk_live_…` key as a secret in server contexts; scope browser exposure with the origin allowlist.
- Rotate keys on staff changes; revoke immediately when a key may be compromised.
- Use read-only DB accounts for scanning; grant delete rights only for retention execution you intend to automate.
- Serve your site over HTTPS so Subresource Integrity and Consent Mode behave correctly.
- Revoke public dashboard links when the audience no longer needs access.

---

# 9. Appendix — Reference Tables & Screenshot Checklist

## 9.1 Key URLs

| Resource | URL |
|----------|-----|
| App (dashboard) | `https://dpdplawshield.zeroshield.ai` |
| CMP script | `https://dpdplawshield.zeroshield.ai/cmp.js` |
| Public API base | `https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1` |
| GTM template | `{API_BASE}/integrations/gtm/template.tpl` |
| Public rights portal | `https://dpdplawshield.zeroshield.ai/portal/{ORG_SLUG}` |

## 9.2 Glossary

| Term | Meaning |
|------|---------|
| **CMP** | Consent Management Platform — the banner + `cmp.js` engine |
| **Property** | A registered website or mobile app |
| **Deployment** | A specific build/target of a mobile property |
| **Purpose** | A lawful reason for processing (DPDPA Sec 6); the consent checkboxes |
| **Proof Vault** | Cryptographically chained, court-admissible consent receipts |
| **RoPA** | Record of Processing Activities |
| **DPIA** | Data Protection Impact Assessment |
| **DPA** | Data Processing Agreement (with a vendor/processor) |
| **SDF** | Significant Data Fiduciary |
| **DSAR** | Data Subject Access Request handled via the rights portal |
| **Obligation** | A pending erasure action created from a lifecycle event |
| **Subject ref** | Your stable identifier for a data principal, used by the org-scoped APIs |
| **Org slug** | Your organization's short URL identifier used in the public portal |

## 9.3 Where to configure what

| Task | Screen |
|------|--------|
| Register website / app property | Integrations → Website / Mobile SDK |
| Generate / rotate API keys | Integrations → property → API Keys |
| Get install snippet | Integrations → property → Install |
| Set origin allowlist | Integrations → property → Settings |
| Configure webhooks | Integrations → property → Webhooks |
| Tag Manager / Consent Mode v2 | Integrations → Tag Manager |
| Connect data sources | Data Protection → Data Sources |
| Run PII scan / masking / retention | Data Protection → PII Scanner / Data Masking / Retention |
| Deployment model & residency | Settings → Deployment Settings |
| Public rights portal | Data Principal Rights → Rights Portal |
| RoPA / DPIA / Policies | Governance → RoPA / DPIA / Policy Manager |
| Vendor risk & DPAs | Governance → Vendor Risk Intelligence |
| Cross-border transfers | Governance → Cross-Border Transfer |
| Security controls & board reports | Governance → CISO Command Center |
| Share / schedule dashboards | Governance → Compliance Dashboards |

## 9.4 Screenshot checklist

Capture these while assembling the manual (technical screens only — far fewer than the User Manual).

| Part | Screens |
|------|---------|
| **Platform (2)** | Deployment Settings · API key "shown once" dialog |
| **Web Integration (4)** | Website property list · Install snippet tab · Tag Manager panel · Verify result |
| **Mobile (1)** | Mobile SDK property list + install steps |
| **API & Webhooks (2)** | Developer Console (keys + cURL) · Webhook deliveries log |
| **Data Sources (3)** | Add Source modal · Connected source card · PII Scanner results |
| **Consent/Portal (3)** | Provider Adapters · Cookie & Tracker Manager · Rights Portal config |
| **Governance (8)** | Governance Guide · RoPA (+discovery) · DPIA risk matrix · Policy lifecycle · Vendor Risk · Cross-Border registry · CISO dashboard · Dashboard builder + Share dialog |

---

*Technical & Integration Manual · Companion to the DPDPA Shield User Manual · Last updated: July 2026*
