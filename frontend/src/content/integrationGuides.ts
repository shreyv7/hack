export type IntegrationGuideId = 'website' | 'mobile_sdk' | 'tag_manager' | 'api_webhooks';

export interface GuideSection {
  /** Stable anchor id used for the table-of-contents and scroll navigation. */
  id: string;
  /** Short label shown in the table of contents. */
  title: string;
  /** GitHub-flavored markdown body for this section. */
  markdown: string;
}

export interface IntegrationGuide {
  id: IntegrationGuideId;
  /** Document title shown in the hero. */
  title: string;
  /** One-line description of the module. */
  subtitle: string;
  /** Who the document is written for (rendered as badges). */
  audience: string[];
  /** DPDPA statutory references this module satisfies. */
  dpdpaRefs: string[];
  /** Approximate reading time, e.g. "8 min read". */
  readingTime: string;
  /** Document version label. */
  version: string;
  /** Last revision date (display string). */
  updated: string;
  sections: GuideSection[];
}

export const INTEGRATION_GUIDES: Record<IntegrationGuideId, IntegrationGuide> = {
  website: {
    id: 'website',
    title: 'Website Integration Whitepaper',
    subtitle: 'A complete user + developer guide to deploying the Vajra JavaScript Consent SDK on any website.',
    audience: ['Web Developers', 'DPOs & Compliance', 'Marketing Ops'],
    dpdpaRefs: ['§6(1)', '§6(3)', '§6(3)(a)', '§8(5)'],
    readingTime: '12 min read',
    version: 'v2.4',
    updated: 'June 2026',
    sections: [
      {
        id: 'summary',
        title: 'Executive Summary',
        markdown: `The **Website Integration** module is a low-code JavaScript loader that lets any website become DPDPA-compliant with a single \`<script>\` tag. Once installed, the SDK performs three jobs automatically:

1. **Renders** the consent banner using the active, legal-approved notice version and language.
2. **Blocks** non-essential third-party scripts (analytics, advertising, functional) until the data principal grants consent.
3. **Records** every decision as a tamper-evident entry in the Vajra Proof Vault.

> **In one sentence:** engineering adds one script, and the platform handles notice display, cookie gating, preference persistence, and audit logging — with no per-tag code changes.

**Outcomes you get**
- Prior-notice compliance before a single tracker fires.
- Granular, purpose-level consent (no blanket opt-in).
- A footer "Consent Preferences" widget for one-click withdrawal.
- Cryptographic evidence of every consent event.`,
      },
      {
        id: 'audience',
        title: 'Who Should Read This',
        markdown: `This whitepaper serves two roles at the client organisation:

| Role | What you'll get from this guide |
| --- | --- |
| **Web Developers** | Snippet placement, script-blocking patterns, CSP rules, dynamic-tag interception, and a QA matrix. |
| **DPOs / Compliance** | How each feature maps to DPDPA sections, where evidence is stored, and how withdrawal is honoured. |
| **Marketing / Analytics Ops** | How tracking categories are gated so campaigns stay compliant without losing legitimate signal. |

No prior Vajra knowledge is assumed. Sections are ordered from concept → setup → reference → troubleshooting.`,
      },
      {
        id: 'architecture',
        title: 'Architecture Overview',
        markdown: `The SDK acts as a **gatekeeper** sitting between the browser, third-party trackers, and the Vajra backend.

\`\`\`
Browser ──loads──▶ Vajra SDK
   │                   │ 1. MutationObserver intercepts <script> nodes
   │                   │ 2. Reads cached consent (localStorage + cookie)
   │                   │ 3. Fetches notice.json from the CDN (if needed)
   │                   ▼
   │              Consent Banner (overlay UI)
   │                   │ 4. User grants / denies purposes
   │                   ▼
   └◀──unblocks──  Approved scripts execute
                       │ 5. Sealed log POSTed to Proof Vault
                       ▼
                  api.vajra.in
\`\`\`

**Key components**
- **Dynamic DOM Engine** — rewrites \`type="text/plain"\` tracker nodes to executable scripts only after consent.
- **CDN Notice API** — serves cached notice schemas (TTL 3600s) for fast first paint.
- **Local Cache** — \`localStorage\` with a cookie backup so choices survive across sessions.
- **Proof Vault writer** — posts a signed payload for every decision.`,
      },
      {
        id: 'features',
        title: 'Feature Catalogue',
        markdown: `Every capability the module ships with:

| Feature | Description |
| --- | --- |
| **One-tag install** | Single async \`<script>\` in \`<head>\`; no build step required. |
| **Dynamic banner rendering** | Pulls the live, approved notice version and the visitor's language. |
| **Purpose-level consent** | Individual toggles per purpose (Analytics, Marketing, Functional…). |
| **Static script gating** | \`type="text/plain"\` + \`data-zs-purpose\` tags stay inert until consent. |
| **Dynamic script interception** | Overrides \`document.createElement('script')\` to catch trackers injected at runtime. |
| **Preference centre** | Sticky footer widget to revisit or withdraw consent on any page. |
| **Notice-version enforcement** | Re-prompts automatically when legal publishes a new notice version. |
| **Geo / language targeting** | Renders localized notice text based on visitor locale. |
| **Proof Vault logging** | Each decision is sealed with a client signature for burden-of-proof. |
| **Coverage scanning** | The property dashboard can scan a domain to detect ungated trackers. |
| **CSP-friendly** | Works under strict Content-Security-Policy with two whitelisted origins. |`,
      },
      {
        id: 'setup',
        title: 'Step-by-Step Setup',
        markdown: `### Step 1 — Register your domain
1. Click **Add Property** on this page.
2. Enter your domain (e.g. \`www.example.com\`) and pick the environment (production / staging).
3. Save. Vajra issues a unique **Property ID** and **client token**.

### Step 2 — Install the loader snippet
Open the property card → **Installation** tab, then paste the snippet as the **first** element in \`<head>\`, before GTM or any pixel:

\`\`\`html
<script async
  src="https://cdn.vajra.in/loader.js"
  data-zs-property="YOUR_PROPERTY_ID"></script>
\`\`\`

### Step 3 — Mark trackers for gating
Refactor existing tags so the SDK can control execution:

\`\`\`html
<!-- Before: fires immediately -->
<script src="https://example.com/analytics.js"></script>

<!-- After: blocked until consent -->
<script type="text/plain"
  data-zs-purpose="analytics"
  data-zs-src="https://example.com/analytics.js"></script>
\`\`\`

### Step 4 — Verify the deployment
1. Open the site in an incognito window.
2. Confirm the banner appears **before** any tracker cookie is written.
3. Accept **Analytics only** → analytics executes, marketing stays blocked.
4. Confirm a sealed record appears in the **Proof Vault**.`,
      },
      {
        id: 'config',
        title: 'Configuration Reference',
        markdown: `Attributes and options you can tune:

| Attribute / Option | Values | Purpose |
| --- | --- | --- |
| \`data-zs-property\` | Property ID | Binds the loader to your property. |
| \`data-zs-purpose\` | \`analytics\` \| \`marketing\` \| \`functional\` \| custom | Category a script belongs to. |
| \`data-zs-src\` | URL | Deferred source executed only after consent. |
| \`async\` | present | Non-blocking load; recommended. |
| Banner layout | \`bar\` \| \`box\` \| \`modal\` | Configured in the property's Banner Builder. |
| Re-prompt on version | on / off | Forces a new prompt when notice version changes. |
| Cache TTL | seconds | CDN notice cache lifetime (default 3600). |`,
      },
      {
        id: 'interception',
        title: 'Script Interception Engine',
        markdown: `Compliance requires trackers to **never** fire before consent. Vajra uses a dual-layer engine.

### Layer 1 — Static node rewriting
Browsers ignore \`<script type="text/plain">\`. The SDK parses these nodes and flips the type to \`text/javascript\` only after the matching purpose is granted.

### Layer 2 — Dynamic creation override
To catch scripts injected by other libraries at runtime, the SDK overrides the DOM API early:

\`\`\`javascript
(function () {
  const create = document.createElement;
  document.createElement = function (tag, options) {
    const el = create.call(document, tag, options);
    if (tag.toLowerCase() === 'script') {
      Object.defineProperty(el, 'src', {
        set(url) {
          const purpose = window.Vajra.matchPurpose(url);
          if (purpose && !window.Vajra.hasConsent(purpose)) {
            el.setAttribute('data-zs-blocked-src', url);
            el.setAttribute('type', 'text/plain');
            return; // execution prevented
          }
          el.setAttribute('src', url);
        },
        get() {
          return el.getAttribute('data-zs-blocked-src') || el.getAttribute('src');
        },
      });
    }
    return el;
  };
})();
\`\`\``,
      },
      {
        id: 'schema',
        title: 'Consent Payload Schema',
        markdown: `When a decision is captured, the SDK sends a signed payload to \`POST /api/public/consent/record\`:

\`\`\`json
{
  "client_token": "zs_prop_e3b0c442",
  "notice_version_id": "c1387d89-9831-419b-a010-8b630f9a2de0",
  "session_id": "8b9e67d4-89d8-4fbb-ba86-fa8ccff88c22",
  "consented_purposes": ["analytics"],
  "denied_purposes": ["marketing"],
  "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
  "client_signature": "e3b0c44298fc1c149afbf4c8996fb924...",
  "fingerprint": "7ac98b11118..."
}
\`\`\`

The backend returns a **block receipt** confirming the entry was sealed in the Proof Vault.`,
      },
      {
        id: 'security',
        title: 'Security & DPDPA Mapping',
        markdown: `| DPDPA Section | Requirement | How the Web SDK satisfies it |
| --- | --- | --- |
| **§6(3)** | Notice must accompany the consent request. | Banner fetches and displays the active notice text inline. |
| **§6(1)** | Consent must be specific & informed. | Per-purpose toggles instead of blanket opt-in. |
| **§6(3)(a)** | Easy withdrawal. | Sticky footer "Consent Preferences" widget. |
| **§8(5)** | Reasonable security safeguards. | Signed payloads, CSP compatibility, no plaintext secrets client-side. |

**Performance & CSP**
- Loader uses \`async\` to avoid blocking render.
- Notice schemas cached at the CDN edge (TTL 3600s); a version publish triggers a cache purge.
- Add to your CSP header:

\`\`\`
script-src https://cdn.vajra.in;
connect-src https://api.vajra.in;
\`\`\``,
      },
      {
        id: 'qa',
        title: 'QA & Troubleshooting',
        markdown: `### QA matrix
- **TC-01 (pre-consent blocking):** First load — \`data-zs-purpose\` scripts stay \`text/plain\`, no cookies written.
- **TC-02 (post-consent unblocking):** Accept All — scripts flip to \`text/javascript\` and the decision posts to \`/consent/record\`.
- **TC-03 (dynamic escape):** Inject a tracker via \`appendChild\` — SDK matches the URL and blocks it.
- **TC-04 (offline resilience):** Block the API, grant consent — choice is cached and queued for later sync.

### Troubleshooting
| Symptom | Fix |
| --- | --- |
| Banner not appearing | Ensure snippet is first in \`<head>\`; verify Property ID. |
| Scripts fire before consent | Add \`type="text/plain"\` + \`data-zs-purpose\`. |
| Stale notice text | Publish a new notice version (CDN purges automatically). |
| CSP blocking SDK | Whitelist \`cdn.vajra.in\` and \`api.vajra.in\`. |`,
      },
    ],
  },

  mobile_sdk: {
    id: 'mobile_sdk',
    title: 'Mobile SDK Integration Whitepaper',
    subtitle: 'A complete user + developer guide to embedding native iOS, Android, and cross-platform consent libraries.',
    audience: ['Mobile Developers', 'DPOs & Compliance', 'Internal Auditors'],
    dpdpaRefs: ['§6(1)', '§6(3)', '§6(3)(a)'],
    readingTime: '13 min read',
    version: 'v4.2',
    updated: 'June 2026',
    sections: [
      {
        id: 'summary',
        title: 'Executive Summary',
        markdown: `The **Mobile SDK** brings DPDPA-compliant consent to native apps. It ships libraries for **iOS (Swift)** and **Android (Kotlin)**, plus wrappers for **React Native, Flutter, Unity, and Cordova**.

The SDK presents notices in plain language, persists preferences in the device's secure storage, blocks analytics SDKs (Firebase, AppsFlyer, Meta) until consent, and syncs decisions to the Proof Vault — even when the device is offline.

> **In one sentence:** initialise the SDK on launch, gate your trackers behind a consent callback, and the library manages the native dialog, storage, and audit trail.`,
      },
      {
        id: 'audience',
        title: 'Who Should Read This',
        markdown: `| Role | What you'll get from this guide |
| --- | --- |
| **Mobile Developers** | Dependency setup, initialization snippets, consent gating, and offline-queue behaviour. |
| **DPOs / Compliance** | How mobile consent maps to DPDPA and where device-originated evidence is stored. |
| **Internal Auditors** | The data schema and verification matrix for mobile consent logs. |

The guide moves from architecture → install → API reference → QA.`,
      },
      {
        id: 'architecture',
        title: 'Architecture Overview',
        markdown: `The SDK manages consent inside the platform's secure sandbox.

\`\`\`
App launch ──init──▶ Vajra SDK
                        │ 1. Read cache (UserDefaults / SharedPreferences)
            cache hit ──┤
                        │      └▶ onConsentReady(consents) → app starts trackers
            cache miss ─┤
                        │ 2. Fetch notice JSON from CDN
                        │ 3. presentConsentModal() → native UI
                        ▼
                   User toggles purposes → Save
                        │ 4. Persist to encrypted storage
                        │ 5. Queue event (offline-safe)
                        ▼
                  Proof Vault API (sealed log)
\`\`\`

- **Native storage** — iOS Keychain-backed \`UserDefaults\`; Android Keystore-backed \`SharedPreferences\`.
- **Offline Queue Manager** — persists decisions and syncs via \`BGAppRefreshTask\` (iOS) / \`WorkManager\` (Android).`,
      },
      {
        id: 'features',
        title: 'Feature Catalogue',
        markdown: `| Feature | Description |
| --- | --- |
| **Cross-platform** | Native iOS & Android; wrappers for RN, Flutter, Unity, Cordova. |
| **Native consent dialog** | Localized, accessible prompt rendered with platform UI. |
| **Encrypted persistence** | Preferences stored via Keychain / Keystore. |
| **Tracker gating** | \`onConsentReady\` callback gates Firebase, AppsFlyer, Meta SDKs. |
| **Privacy Center** | \`showConsentCenter()\` reopens preferences from app Settings. |
| **Offline queue** | Decisions cached and synced when connectivity returns. |
| **Notice-version enforcement** | Re-prompts when the server notice version changes. |
| **Programmatic state API** | Query \`hasConsent(purpose)\` / \`shouldPromptUser()\` anytime. |
| **Proof Vault sync** | Sealed log per decision with sequential block metadata. |`,
      },
      {
        id: 'setup',
        title: 'Step-by-Step Setup',
        markdown: `### Step 1 — Register the app target
1. Click **Add App Target** on this page.
2. Choose platform: **iOS / Android / Flutter / React Native**.
3. Enter the bundle identifier (e.g. \`com.example.myapp\`) and environment.
4. Save to receive an **API key** and **Property ID**.

### Step 2 — Add the dependency
**iOS (Swift Package Manager):**
\`\`\`
https://github.com/vajra/ios-sdk
\`\`\`
**Android (Gradle):**
\`\`\`kotlin
implementation("io.vajra:android-sdk:4.2.1")
\`\`\`

### Step 3 — Initialise on launch
**iOS:**
\`\`\`swift
Vajra.initialize(
  clientToken: "YOUR_CLIENT_TOKEN",
  fallbackPolicy: .cacheLast
)
\`\`\`
**Android:**
\`\`\`kotlin
Vajra.initialize(
  context = this,
  clientToken = "YOUR_CLIENT_TOKEN",
  fallbackPolicy = FallbackPolicy.CACHE_LAST
)
\`\`\`

### Step 4 — Present the dialog
\`\`\`swift
if Vajra.shouldPromptUser() {
  Vajra.presentConsentController()
}
\`\`\`

### Step 5 — Gate your trackers
\`\`\`swift
Vajra.onConsentReady { consents in
  if consents["analytics"] == true { FirebaseApp.configure() }
}
\`\`\`

### Step 6 — Add a Privacy Center entry
Expose \`Vajra.showConsentCenter()\` from Settings so users can withdraw anytime.`,
      },
      {
        id: 'api',
        title: 'SDK API Reference',
        markdown: `| Method | Returns | Description |
| --- | --- | --- |
| \`initialize(token, fallbackPolicy)\` | void | Boots the SDK on app start. |
| \`shouldPromptUser()\` | Bool | True if no valid consent for the current notice version. |
| \`presentConsentController()\` | void | Shows the native consent modal. |
| \`showConsentCenter()\` | void | Reopens preferences from anywhere (e.g. Settings). |
| \`hasConsent(purpose)\` | Bool | Whether a specific purpose is granted. |
| \`onConsentReady(callback)\` | void | Fires with the consent map once a decision exists. |

**Fallback policies:** \`.cacheLast\` (use last known consent if offline) or \`.blockAll\` (deny non-essential until fresh consent).`,
      },
      {
        id: 'schema',
        title: 'Notice Payload Schema',
        markdown: `The dynamic notice the SDK fetches:

\`\`\`json
{
  "notice_version": 12,
  "last_updated": "2026-06-24T23:55:00Z",
  "display_name": "Consent Options",
  "purposes": [
    { "id": "analytics", "name": "Analytics & Statistics", "required": false,
      "description": "Helps us improve our mobile application features." },
    { "id": "marketing", "name": "Targeted Ads", "required": false,
      "description": "Displays relevant advertising inside the app." }
  ]
}
\`\`\``,
      },
      {
        id: 'offline',
        title: 'Offline Resilience',
        markdown: `If the device is offline when consent is given:

1. The decision is written to disk (lightweight SQLite / file stream).
2. A background sync worker is scheduled (\`BGAppRefreshTask\` on iOS, \`WorkManager\` on Android).
3. When connectivity returns, queued events upload **sequentially** so Proof Vault block ordering is preserved — no event is lost.`,
      },
      {
        id: 'security',
        title: 'Security & DPDPA Mapping',
        markdown: `| DPDPA Section | Requirement | How the Mobile SDK satisfies it |
| --- | --- | --- |
| **§6(3)** | Notice accompanies the consent request. | Localized notice JSON populates the native dialog. |
| **§6(1)** | Specific & informed consent. | Per-purpose toggle switches in the dialog. |
| **§6(3)(a)** | Easy withdrawal. | \`showConsentCenter()\` reopens preferences from Settings. |

Preferences are encrypted at rest via platform key stores; tokens are never logged in plaintext.`,
      },
      {
        id: 'qa',
        title: 'QA & Troubleshooting',
        markdown: `### QA matrix
- **TC-01 (clean launch):** First install shows the modal before other features load.
- **TC-02 (state memory):** Relaunch after consent — \`shouldPromptUser()\` returns false, preferences match.
- **TC-03 (offline queue):** Airplane mode → consent cached → reconnect → worker posts to \`/consent/record\`.
- **TC-04 (version enforcement):** Bump server notice version → next launch re-prompts.

### Troubleshooting
| Symptom | Fix |
| --- | --- |
| Dialog not showing | Call \`shouldPromptUser()\` first; verify API key. |
| Trackers fire early | Move init into \`onConsentReady\`. |
| Consent not syncing | Check network; inspect offline queue in the dashboard. |
| Wrong language | Set device locale or pass \`language\` to init. |`,
      },
    ],
  },

  tag_manager: {
    id: 'tag_manager',
    title: 'Tag Manager Integration Whitepaper',
    subtitle: 'A complete user + developer guide to syncing Google Tag Manager and other containers with Vajra consent.',
    audience: ['Marketing / Analytics Ops', 'Web Developers', 'DPOs & Compliance'],
    dpdpaRefs: ['§6(1)', '§6(3)(a)'],
    readingTime: '11 min read',
    version: 'v2.1',
    updated: 'June 2026',
    sections: [
      {
        id: 'summary',
        title: 'Executive Summary',
        markdown: `The **Tag Manager Integration** (the "Consent Enforcement Engine") bridges your consent banner with **Google Tag Manager**, **Adobe Launch**, **Tealium**, or a **Custom JS Blocker**. Tags fire only when the user has granted the matching purpose — with no per-tag code edits.

It works by pushing standardized \`dataLayer\` events that your container's triggers read, so marketing teams manage firing rules from one place while staying compliant.

> **In one sentence:** map each tag to a purpose, and Vajra's \`dataLayer\` signals make GTM fire or block tags in real time as consent changes.`,
      },
      {
        id: 'audience',
        title: 'Who Should Read This',
        markdown: `| Role | What you'll get from this guide |
| --- | --- |
| **Marketing / Analytics Ops** | How to map tracking tools to purposes and verify firing with the simulator. |
| **Web Developers** | Template import, custom-variable setup, and trigger configuration. |
| **DPOs / Compliance** | How tag firing is bound to notice versions and how withdrawal pauses tags. |`,
      },
      {
        id: 'architecture',
        title: 'Architecture Overview',
        markdown: `The integration is a bridge between the browser's \`dataLayer\` and the Vajra Web SDK.

\`\`\`
Browser ──loads──▶ GTM container + Vajra SDK
   SDK ──push──▶ dataLayer: { event: "vajra_consent_init", ... }
   GTM ──reads──▶ consent variables → evaluates triggers
   User grants Analytics / denies Marketing
   SDK ──push──▶ dataLayer: { event: "vajra_consent_update", ... }
   GTM ──fires──▶ Analytics tag       (trigger matched)
   GTM ──blocks─▶ Meta Pixel tag      (trigger fails)
\`\`\`

Prerequisite: the **Website SDK must already be deployed** on the site, because Tag Manager enforcement relies on the SDK pushing consent state.`,
      },
      {
        id: 'features',
        title: 'Feature Catalogue',
        markdown: `The admin module is organised into tabs, each a feature surface:

| Tab / Feature | Description |
| --- | --- |
| **Overview** | Health summary: managed tags, containers, recent violations. |
| **Containers** | Register GTM / Adobe Launch / Tealium / Custom containers; enable Consent Mode & Auto-Sync. |
| **Tags** | Map each managed tag to a purpose, execution type, and priority. |
| **Consent Rules** | Declarative rules: on purpose + consent value → Execute / Block. |
| **Trigger Simulator** | Toggle purposes and preview which tags fire or block. |
| **Violations** | Detects tags that bypass consent and flags them. |
| **Analytics** | Daily metrics on tag executions and blocks. |
| **Settings** | Global container behaviour and Consent Mode v2 mapping. |
| **GTM Template Exporter** | Downloads a ready-to-import \`.tpl\` custom template. |
| **Provider support** | Google Tag Manager, Adobe Launch, Tealium, Custom JS Blocker. |`,
      },
      {
        id: 'setup',
        title: 'Step-by-Step Setup',
        markdown: `### Step 1 — Confirm the Website SDK is live
Complete the **Website Integration** guide first; Tag Manager enforcement depends on it.

### Step 2 — Register your container
1. Open the **Containers** tab → **Add Container**.
2. Select provider (GTM / Adobe Launch / Tealium / Custom).
3. Enter the **Container ID** (e.g. \`GTM-XXXXXXX\`) and link a property.
4. Enable **Consent Mode** and **Auto Sync**.

### Step 3 — Import the Vajra GTM template
1. In GTM: **Templates → Import**.
2. Download the \`.tpl\` from the Containers tab and import it.
3. Create a **Custom Variable** for each purpose (analytics, marketing, functional).

### Step 4 — Configure tag triggers
For each third-party tag:
1. Trigger type → **Custom Event**.
2. Event name → \`vajra_consent_init\` or \`vajra_consent_update\`.
3. Condition → \`vajra_consent.analytics\` equals \`true\` (adjust per purpose).

### Step 5 — Map purposes to tags
In the **Tags** tab, link each managed tag to its required purpose, set execution type (External Script / Inline) and priority.

### Step 6 — Validate with the Simulator
Open **Trigger Simulator**, toggle purposes, run, and confirm the fire/block outcome per combination.`,
      },
      {
        id: 'datalayer',
        title: 'dataLayer Event Reference',
        markdown: `The SDK emits two standardized events.

**Initialization (on page load):**
\`\`\`json
{
  "event": "vajra_consent_init",
  "vajra_consent": { "analytics": false, "marketing": false, "functional": true }
}
\`\`\`

**Live update (user changes preferences):**
\`\`\`json
{
  "event": "vajra_consent_update",
  "vajra_consent": { "analytics": true, "marketing": false, "functional": true }
}
\`\`\`

**GTM custom-variable template (sandboxed JS):**
\`\`\`javascript
const queryPermission = require('queryPermission');
const getWindowProperty = require('getWindowProperty');

if (queryPermission('get', 'read_interface')) {
  const zs = getWindowProperty('Vajra');
  if (zs && zs.consent) return zs.consent[data.purposeName] === true;
}
return false;
\`\`\``,
      },
      {
        id: 'security',
        title: 'Security & DPDPA Mapping',
        markdown: `| DPDPA Section | Requirement | How Tag Manager satisfies it |
| --- | --- | --- |
| **§6(1)** | Specific & informed consent. | Triggers bound to per-purpose variables (e.g. \`zs_consent_marketing\`) prevent mixed firing. |
| **§6(3)(a)** | Simple withdrawal. | On withdrawal, the SDK pushes \`vajra_consent_update\`, pausing affected tags immediately. |

Container IDs are mapped to notice revisions, ensuring fired tags correlate to the exact notice version the user saw — a tamper-evident audit trail.`,
      },
      {
        id: 'qa',
        title: 'QA & Troubleshooting',
        markdown: `### QA matrix
- **TC-01:** GTM Preview shows \`vajra_consent_init\` on load.
- **TC-02:** Granting Marketing fires the Meta Pixel trigger.
- **TC-03:** First visit, no consent — analytics/marketing tags show "Not Fired".
- **TC-04:** Withdraw Analytics → \`analytics: false\` pushed → tag stops.

### Troubleshooting
| Symptom | Fix |
| --- | --- |
| Tags fire without consent | Verify trigger conditions reference \`vajra_consent.*\`. |
| dataLayer events missing | Ensure the SDK loads before the GTM container. |
| Container sync failing | Re-run sync from Containers tab; re-check Container ID. |
| Violations reported | Review the **Violations** tab for tags bypassing rules. |`,
      },
    ],
  },

  api_webhooks: {
    id: 'api_webhooks',
    title: 'API & Webhooks Whitepaper',
    subtitle: 'A complete user + developer guide to the Vajra REST API and real-time consent webhooks.',
    audience: ['Backend Engineers', 'Integrators', 'Compliance Auditors'],
    dpdpaRefs: ['§6(3)(a)', '§6(10)', '§8(6)'],
    readingTime: '14 min read',
    version: 'v1.6',
    updated: 'June 2026',
    sections: [
      {
        id: 'summary',
        title: 'Executive Summary',
        markdown: `The **API & Webhooks** module is the programmatic gateway between Vajra and your backend systems (CRM, ERP, data warehouse). Use **REST API keys** to query consent and configuration, and register **webhook endpoints** to receive signed, real-time events the moment consent changes.

The headline use case: when a user withdraws consent, a signed \`consent.withdrawn\` event reaches your systems within seconds so downstream jobs can purge or mask records — enforcing DPDPA's "stop processing on withdrawal" requirement automatically.

> **In one sentence:** authenticate with an API key, subscribe to events, verify HMAC signatures, and react to consent changes across your enterprise in real time.`,
      },
      {
        id: 'audience',
        title: 'Who Should Read This',
        markdown: `| Role | What you'll get from this guide |
| --- | --- |
| **Backend Engineers / Integrators** | Auth, endpoints, webhook registration, signature verification, and retry behaviour. |
| **Compliance Auditors** | How withdrawal propagation is logged and tied to Proof Vault sequences. |`,
      },
      {
        id: 'architecture',
        title: 'Architecture Overview',
        markdown: `Two flows: outbound webhooks and inbound REST.

\`\`\`
Outbound (events):
  Event broker ─▶ Dispatch Worker
     │ 1. Sign payload with HMAC-SHA256
     │ 2. POST to your endpoint
     ▼
  Your endpoint ─▶ verify signature ─▶ 200 OK
     (on failure → exponential backoff retry)

Inbound (REST):
  Your service ─▶ X-API-KEY ─▶ FastAPI router ─▶ scoped data
\`\`\`

Every dispatch is logged with status code and latency; failures escalate to a \`degraded\` endpoint state with an alert.`,
      },
      {
        id: 'features',
        title: 'Feature Catalogue',
        markdown: `The Developer Console is organised into tabs and capabilities:

| Feature | Description |
| --- | --- |
| **Property credential selector** | Pick the property whose keys/snippets you need. |
| **API Keys table** | View prefix, created/last-used dates, status; generate & revoke. |
| **Config snippet (tab)** | Ready-made cURL to fetch SDK config for a property. |
| **Consent snippet (tab)** | cURL to record consent from custom/server-side clients. |
| **Heartbeat snippet (tab)** | cURL to report SDK version & device health. |
| **Webhook subscriptions** | Register endpoint URLs and select event types. |
| **Signing secret** | Per-endpoint HMAC-SHA256 secret (shown once). |
| **Delivery Log** | ID, event, URL, status code, latency; inspect raw payloads. |
| **Send Test Event** | Fire a sample event to validate your handler. |
| **Retry manager** | Exponential backoff with automatic degraded-state escalation. |
| **Event types** | \`consent.granted\`, \`consent.withdrawn\`, \`notice.updated\`, \`dpo.complaint_filed\`. |`,
      },
      {
        id: 'setup',
        title: 'Step-by-Step Setup',
        markdown: `### Step 1 — Select a property
Choose the property in the **Property Access Credentials** selector at the top of the page.

### Step 2 — Copy your API key
Use the full key (shown once at creation) in the \`X-API-KEY\` header on every request.

### Step 3 — Test the config endpoint
\`\`\`bash
curl -X GET "https://api.vajra.in/public/v1/integrations/sdk/config/PROPERTY_ID" \\
  -H "X-API-KEY: zsk_live_YOUR_KEY"
\`\`\`

### Step 4 — Register a webhook endpoint
1. Enter your HTTPS endpoint (must return 200 OK).
2. Select events: \`consent.granted\`, \`consent.withdrawn\`, etc.
3. Click **Add Webhook** and copy the **Signing Secret** immediately.

### Step 5 — Verify signatures (always)
\`\`\`python
import hmac, hashlib

def verify(payload: bytes, secret: str, signature: str, timestamp: str) -> bool:
    msg = f"{timestamp}.".encode() + payload
    expected = hmac.new(secret.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
\`\`\`

### Step 6 — Act on withdrawal
On \`consent.withdrawn\`, immediately stop processing the withdrawn purposes downstream (CRM, ad platforms, warehouse).

### Step 7 — Monitor deliveries
Use the **Delivery Log** to inspect payloads/latency and **Send Test Event** to validate handlers.`,
      },
      {
        id: 'endpoints',
        title: 'REST API Reference',
        markdown: `All requests require the \`X-API-KEY\` header.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| \`/public/v1/integrations/sdk/config/{id}\` | GET | Fetch notice & SDK config for a property. |
| \`/public/v1/integrations/sdk/consent\` | POST | Record consent from a custom/server client. |
| \`/public/v1/integrations/sdk/heartbeat/{id}\` | POST | Report SDK version & device health. |

**Record-consent example:**
\`\`\`bash
curl -X POST "https://api.vajra.in/public/v1/integrations/sdk/consent" \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: zsk_live_YOUR_KEY" \\
  -d '{
    "property_id": "PROPERTY_ID",
    "deployment_id": "YOUR_DEPLOYMENT_ID",
    "session_id": "user_session_45",
    "consented_purposes": ["essential", "analytics"],
    "language": "hi",
    "device_info": "iOS Application (Swift)"
  }'
\`\`\``,
      },
      {
        id: 'webhooks',
        title: 'Webhook Signing & Schema',
        markdown: `### Signature steps
1. Build the signed string: \`payload_string = timestamp + "." + raw_json\`.
2. Compute \`hmac_sha256(payload_string, signing_secret)\`.
3. Compare against \`X-Vajra-Signature\` using a **constant-time** comparison.

> Always use the **raw request body** (not re-serialized JSON) — re-serialization changes byte order and breaks the signature.

### Event schema
\`\`\`json
{
  "event_id": "evt_92831aef-891d-4bb2",
  "event_type": "consent.withdrawn",
  "timestamp": "2026-06-25T00:00:00Z",
  "payload": {
    "data_principal_id": "usr_71829aef",
    "notice_version_id": "c1387d89-9831-419b-a010-8b630f9a2de0",
    "withdrawn_purposes": ["marketing"],
    "ip_address": "192.168.1.1",
    "proof_vault_block_number": 1420
  }
}
\`\`\``,
      },
      {
        id: 'retries',
        title: 'Retry & Reliability',
        markdown: `Failed deliveries (non-2xx or timeout) retry with exponential backoff:

\`\`\`
Retry delay = initial_interval × multiplier ^ attempt
initial_interval = 10s, multiplier = 3x, max attempts = 5
→ 10s, 30s, 90s, 270s, 810s  (~ spread over hours)
\`\`\`

After all 5 attempts fail, the endpoint is marked **degraded** and a system alert (\`§8(6)\` breach-readiness) is triggered so integrators can intervene.`,
      },
      {
        id: 'security',
        title: 'Security & DPDPA Mapping',
        markdown: `| DPDPA Section | Requirement | How API & Webhooks satisfy it |
| --- | --- | --- |
| **§6(3)(a)** | Stop processing on withdrawal. | \`consent.withdrawn\` triggers instant downstream purge/mask jobs. |
| **§6(10)** | Burden-of-proof audit. | Events tie to Proof Vault block numbers for consistent trails. |
| **§8(6)** | Breach reporting readiness. | Degraded-endpoint alerts flag integration breakdowns early. |

Keys are scoped per property; signing secrets are shown once; signatures use constant-time comparison to resist timing attacks.`,
      },
      {
        id: 'qa',
        title: 'QA & Troubleshooting',
        markdown: `### QA matrix
- **TC-01:** Valid API key → \`/consent/summary\` returns 200.
- **TC-02:** Trigger withdrawal → worker sends signed POST → SUCCESS delivery logged.
- **TC-03:** Tampered payload → handler returns 401.
- **TC-04:** Endpoint returns 503 → retries follow 10s/30s/90s… backoff.

### Troubleshooting
| Symptom | Fix |
| --- | --- |
| 401 Unauthorized | Verify the key is active and sent in \`X-API-KEY\`. |
| Signature mismatch | Use the raw body for HMAC; check timestamp concatenation. |
| Events not arriving | Endpoint must return 200 within 10s; check Delivery Log. |
| Degraded endpoint | Fix server errors, then re-enable in webhook settings. |`,
      },
    ],
  },
};
