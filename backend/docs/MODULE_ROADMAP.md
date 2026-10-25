# 🗺️ Vajra — Project Understanding, Module Complexity & Team Plan

> Read this top-to-bottom once. Part 1 explains **what the product is and why**
> (in plain language). Part 2 explains **every module** — what it does, the flow,
> what it solves, and how hard it is to build. Part 3 is the **complexity table**.

---

# PART 1 — What is this product, in plain English?

## 1.1 The law it implements (DPDPA 2023)

India passed the **Digital Personal Data Protection Act, 2023 (DPDPA)** — India's
version of the EU's GDPR. It controls how companies collect and use people's
personal data (name, phone, Aadhaar, health info, etc.). If a company breaks the
rules, the **Data Protection Board of India (DPB)** can fine them heavily (up to
₹250 crore).

**The 4 actors you must know:**

| Term | Plain meaning | GDPR equivalent |
|---|---|---|
| **Data Principal (DP)** | The *person* whose data is collected (a customer, user) | Data Subject |
| **Data Fiduciary (DF)** | The *company* that decides why/how to use the data | Controller |
| **Data Processor** | A vendor that processes data *on behalf of* the fiduciary | Processor |
| **Significant Data Fiduciary (SDF)** | A big/high-risk fiduciary with extra duties (audits, DPIA, a DPO) | — |
| **Data Protection Board (DPB)** | The government regulator that enforces the law | Supervisory Authority |

**What the law actually requires a company to do** (these map directly to our modules):
1. **Give a clear notice** before collecting data (what, why, how to complain).
2. **Take valid consent** — free, specific, informed, and **as easy to withdraw as to give**.
3. **Honour people's rights** — let them access, correct, erase their data, and complain.
4. **Report data breaches** to the DPB and to affected people.
5. **Delete data** when it's no longer needed (retention limits).
6. **Protect children** — verifiable parental consent for under-18, no ad-targeting.
7. **Keep security safeguards** and **records** (who you share data with, what you process).
8. **Be auditable** — prove all of the above to the regulator on demand.

## 1.2 What our product does (the elevator pitch)

**Vajra is a compliance platform that a company buys so it can obey the
DPDPA without building all this themselves.** It is **multi-tenant** — each
customer company is an "Organization" (tenant), and we (the product owner) sit
above all of them as Superadmin.

In one sentence per pillar, the product lets a company:
- **Collect & prove consent** (Consent Builder + Banner + Proof Vault),
- **Serve data-principal rights** within legal deadlines (Rights Portal + SLA Engine),
- **Handle breaches** within the 72-hour legal window (Breach Manager),
- **Know what data it holds** and who it shares with (Data Inventory, RoPA, Vendors),
- **Prove compliance** to auditors and leadership (Dashboard, Audit Log, CISO Center),
- and **get guided help** (Vajra AI).

## 1.3 Why this is non-trivial to build

Most modules are ordinary **CRUD** (create/read/update/delete forms + lists) — The *hard* parts are a small number of modules that need:
- **Time-based automation** (countdowns + scheduled reminders → background workers),
- **Cryptographic integrity** (tamper-proof consent records),
- **Scanning engines** (crawl a website for cookies; scan a database for PII),
- **AI** (the chatbot),
- **External integrations** (email, real databases, file storage).

Knowing which is which is the whole point of Part 2 and Part 3.

---

# PART 2 — Every module explained (with complexity)

> **Complexity key:** 🟢 Easy · 🟡 Medium · 🟠 Hard · 🔴 Very hard
---

## TIER 0 — Foundation (must exist before most things)

### 0.1 Auth & Multi-Tenancy — 🟡 Medium *(in progress)*
- **What:** Login, roles (superadmin/admin/user), organizations, invites.
- **Why:** Every other table is scoped to an organization; nothing works without it.
- **See** `docs/AUTH_DESIGN.md`.

### 0.2 Workspace & Settings — 🟢 Easy *(~2–3 days)*
- **What:** The org's own profile: company name, address, DPO contact, industry,
  logo, and which DPDPA role each team member plays (DF / DP / SDF / DPO).
- **Why it solves:** The law requires you to name a contact/DPO and declare your
  role. Also feeds branding into the public Rights Portal and notices.
- **Flow:** Admin opens Settings → fills forms → saved to `tenant`/`role_mappings`.
- **Hard parts:** None. Pure CRUD. Good "warm-up" module.
- **Frontend pages:** WorkspaceInfo, IndustryConfig, DPDPRoleMapping, DeploymentSettings.

### 0.3 Audit Log — 🟡 Medium *(~2–3 days)*
- **What:** An automatic record of *every* create/update/delete: who did what,
  when, from which IP. Plus a screen to search/filter and an export button.
- **Why it solves:** "Be auditable." When the regulator asks "who deleted this
  consent record?", you can show them. This is evidence.
- **How:** A FastAPI **middleware/dependency** that writes an `audit_logs` row on
  every mutating request. Other modules don't need to remember to log.
- **Hard parts:** Doing it *automatically* (middleware) rather than by hand in
  every endpoint. Build it early so all later modules are logged for free.

### 0.4 Background-jobs infrastructure (Celery + Redis) — 🟠 Hard *(~2–3 days, one-time)*
- **What:** Not a feature — the *engine* that runs things on a timer or in the
  background: SLA reminders, the 72-hour breach clock, auto-deletion, scans, bulk
  emails. Celery = the worker; Redis = the queue + scheduler ("Celery Beat").
- **Why:** ~6 modules below are impossible without it. Set it up once, early.
- **Hard parts:** Wiring Celery to FastAPI, running a worker + beat process,
  testing that scheduled tasks actually fire. This is infra, not a form.
- **Note:** Until this exists, time-based modules can be built with their logic in
  place but "reminders" stubbed.

### 0.5 Shared services: File storage + PDF/Report generation — 🟡 Medium *(~3–4 days)*
- **What:** (a) a place to store uploaded files & generated exports (local folder
  now, S3/MinIO later); (b) a helper that turns data into PDFs (consent evidence,
  closure letters, RoPA register, compliance report).
- **Why:** Many modules "export evidence" — build the helper once, reuse everywhere.
- **Hard parts:** PDF templating is fiddly; keep it simple (one helper, HTML→PDF).

---

## TIER 1 — Consent (the heart of DPDPA)

### 1.1 Consent Notice Builder + Purpose Registry — 🟡 Medium *(~4–5 days)*
- **What:** Build the "notice" a user sees before giving data, and a registry of
  **purposes** (e.g. "marketing emails", "loan processing"). Each purpose lists
  what data it needs, the legal basis, and how long data is kept. Notices have
  **versions** and a publish/archive lifecycle.
- **Why it solves:** The law says consent must be **purpose-specific** and preceded
  by a clear notice. Versioning matters because you must prove *which* notice a
  person agreed to, even years later.
- **Flow:** Admin creates purposes → builds a notice linking those purposes →
  publishes (version 1) → edits later → version 2, old version kept for history.
- **Hard parts:** Versioning (never overwrite — create a new version), and the
  many-to-many link between notices and purposes. Otherwise CRUD.
- **Pages:** ConsentNoticesManager, PurposeRegistryNew, NewConsentNotice.

### 1.2 Banner Builder + multi-language + delivery channels — 🟡 Medium *(~4–5 days total)*
- **What:** Design the cookie/consent banner shown on the customer's website
  (colors, text, layout) and produce an **embeddable script tag**. Plus translate
  notices into multiple languages, and configure delivery (email/SMS/WhatsApp).
- **Why it solves:** Consent must be collected at the point of data capture and in
  a language the person understands (DPDPA allows 22 languages).
- **Hard parts:** Generating the embeddable JS snippet; the rest is config CRUD.
- **Pages:** BannerBuilderDashboard, CreateBannerWizard, MultiLanguageEditor,
  NoticeDeliveryChannels, ConsentManagerIntegration.

### 1.3 Proof Vault — 🟠 Hard *(~4–6 days)*
- **What:** A **tamper-proof, write-once** ledger of every consent given:
  who, when, what they agreed to, IP, device. Each record gets a **SHA-256
  checksum chained to the previous record** (like a mini-blockchain), so if anyone
  edits an old record, the chain breaks and verification fails.
- **Why it solves:** This is your *legal evidence*. In a dispute, you prove the
  person consented and that the record wasn't altered. The chaining is what makes
  it trustworthy in front of a regulator.
- **Flow:** Banner/SDK calls `record consent` → server hashes content + previous
  hash → stores it → later, `verify` re-computes the chain to detect tampering.
- **Hard parts:** Getting the hash-chain right; making records **immutable** (no
  update/delete allowed); PDF evidence export. This is the most "computer-science"
  of the early modules
- **Pages:** ProofVault.

---

## TIER 2 — Rights & Breach (deadline-driven, needs jobs)

### 2.1 Rights Portal (public) — 🟡–🟠 Medium/Hard *(~3–4 days)*
- **What:** A **public, no-login** page (branded per organization) where any
  citizen can submit a request: "show me my data / correct it / delete it /
  complain / nominate someone." Includes identity verification (email/OTP) and a
  status checker.
- **Why it solves:** The law gives Data Principals these rights and the company
  must provide an easy way to exercise them.
- **Hard parts:** It's **unauthenticated** (careful: rate-limit, verify identity,
  prevent abuse) and **tenant-branded by URL slug** (`/portal/{org-slug}`).
- **Pages:** DataRightsPortalPublic.

### 2.2 Rights SLA Engine — 🟠 Hard *(needs jobs, ~4–5 days)*
- **What:** Tracks each request against a **30-day legal deadline**. Sends
  reminders at 7/3/1 days left, escalates overdue ones, and generates a **closure
  document** when resolved. Has an internal queue for the DPO to work through
  (assign → verify → process → close) with analytics.
- **Why it solves:** Missing the deadline = a violation. The engine makes sure the
  company never silently misses one.
- **Flow:** Request arrives → due_date = +30 days → daily background job checks
  approaching/overdue → emails reminders → DPO closes → PDF closure letter.
- **Hard parts:** The countdown + **scheduled reminders** (needs Tier-0.4 jobs) +
  email + PDF. The workflow itself is medium; the automation is the hard bit.
- **Pages:** DSARSLATracker, DataRightsPortal.

### 2.3 Breach Manager — 🟠 Hard *(needs jobs, ~5–7 days)*
- **What:** When a data breach happens, a **72-hour countdown** starts. A 5-step
  wizard guides the team: assess impact → draft notice to the DPB → notify
  affected people (bulk email/SMS) → public disclosure → submit. Stores evidence.
- **Why it solves:** DPDPA mandates breach reporting to the Board and to affected
  individuals, fast. This module enforces the clock and produces the paperwork.
- **Flow:** Create incident → clock starts → fill wizard steps (progress saved) →
  generate DPB notification → dispatch principal notifications → mark submitted.
- **Hard parts:** The 72-hour timer (jobs), bulk notifications (email infra), the
  multi-step wizard with save-per-step, and notification templates.
- **Pages:** BreachIncidentsList, IncidentDetail, BreachDisclosureWizard.

---

## TIER 3 — Data governance (mostly CRUD, some scanning)

### 3.1 Data Inventory & Data Sources — 🟡 Medium *(~3–4 days)*
- **What:** A register of where personal data lives: databases, S3 buckets, APIs.
  For each source, list its tables/columns and classify them (personal/sensitive).
- **Why it solves:** "Know what data you hold." You can't protect or delete data
  you haven't catalogued.
- **Hard parts:** *Optionally* test-connecting to real databases (that's harder);
  the MVP can be manual entry = easy.
- **Pages:** DataSources, DataInventory.

### 3.2 RoPA (Records of Processing Activities) — 🟢 Easy *(~2–3 days)*
- **What:** A formal register: each processing activity, its purpose, legal basis,
  data categories, retention, and which processor/vendor is involved. Exportable.
- **Why it solves:** SDFs must maintain RoPA; auditors ask for it directly.
- **Hard parts:** None — CRUD + a formatted export.
- **Pages:** RoPAModule.

### 3.3 DPIA (Data Protection Impact Assessment) — 🟡 Medium *(~3–4 days)*
- **What:** A questionnaire-driven risk assessment for a new project that uses
  personal data, with a draft→review→approve workflow and an auto risk score.
- **Why it solves:** SDFs must run DPIAs for high-risk processing.
- **Hard parts:** The review workflow + a simple scoring rule. Otherwise CRUD.
- **Pages:** DPIAModule.

### 3.4 Retention Policies + auto-deletion — 🟠 Hard *(needs jobs, ~3–4 days)*
- **What:** Define "keep marketing data 2 years, then delete." A background job
  finds data past its limit and deletes it, leaving a deletion audit trail.
- **Why it solves:** The law's storage-limitation principle (delete when done).
- **Hard parts:** The **automated deletion job** (jobs) and doing it safely +
  auditably. Defining policies is easy; enforcing them is the hard part.
- **Pages:** RetentionPolicyManager.

### 3.5 Children's Data — 🟡 Medium *(~3–4 days)*
- **What:** Detect/flag users under 18, require **verifiable parental consent**,
  and block profiling/ad-targeting on their records.
- **Why it solves:** DPDPA Section 9 has strict child-protection rules.
- **Hard parts:** Parental-consent recording (ties into Proof Vault) and the
  restriction flags. Medium.
- **Pages:** ChildrensData.

### 3.6 Policy Manager — 🟢 Easy *(~3–4 days)*
- **What:** Manage privacy-policy documents: draft → publish → archive, with
  versions, and track which employees **acknowledged** each version.
- **Why it solves:** Demonstrates internal governance + staff awareness.
- **Hard parts:** Versioning + acknowledgements; both straightforward.
- **Pages:** PolicyManager.

### 3.7 Vendor Risk Intelligence — 🟡 Medium *(~3–4 days)*
- **What:** Register every data **processor/vendor**, track whether a signed
  **DPA** (data-processing agreement) exists and when it expires, and compute a
  **risk score** (based on DPA status, certifications, data sensitivity). Alerts
  before a DPA expires.
- **Why it solves:** The fiduciary is liable for its processors; you must track them.
- **Hard parts:** The scoring formula + expiry alerts (alerts need jobs). Medium.
- **Pages:** VendorRiskIntelligence.

---

## TIER 4 — Oversight & intelligence (depends on other modules' data)

### 4.1 CISO Command Center / Security Safeguards — 🟡 Medium *(~3–4 days)*
- **What:** A grid of ~19 security controls (encryption, MFA, logging, etc.) each
  mapped to CIS / ISO 27001 / DPDPA, with status + evidence upload.
- **Why it solves:** "Reasonable security safeguards" requirement; gives the CISO
  one screen showing posture.
- **Hard parts:** Mostly data + the framework mapping. Medium.
- **Pages:** CISOCommandCenter, SecuritySafeguardsHub.

### 4.2 Compliance Dashboard + Score Engine — 🟠 Hard *(~4–6 days, build LAST-ish)*
- **What:** A single **compliance score** (e.g. 78/100) computed from how complete
  every other module is (consent %, rights closed on time, breaches handled,
  controls met…), plus gaps, deadlines, trends, and board-ready reports.
- **Why it solves:** Leadership/board need a number and evidence; this is the
  "are we compliant?" headline.
- **Hard parts:** It **aggregates across all other modules**, so it can only be
  finished after they exist. The scoring weights need thought. Build the shell
  early, fill the formula late.
- **Pages:** ComplianceScoreDeepDive, ComplianceDashboardBuilder, Dashboard.

### 4.3 Monitoring & Scheduling — 🟠 Hard *(needs jobs, ~4–5 days)*
- **What:** Lets admins schedule recurring automated checks (PII scan, cookie
  scan, policy review, vendor check) at a plan-based frequency, with a run log.
- **Why it solves:** Compliance isn't one-time; this keeps it continuous.
- **Hard parts:** Dynamic scheduling via **Celery Beat** + execution logging.
- **Pages:** MonitoringScheduling.

---

## TIER 5 — Specialized / hardest (treat as R&D spikes, schedule carefully)

### 5.1 Vajra AI (compliance chatbot) — 🟠 Hard *(~4–6 days; ~2–3 with mock)*
- **What:** A chatbot that answers DPDPA questions *with the tenant's own context*
  (their score, gaps, pending items) and can draft notices or suggest fixes.
- **Why it solves:** Makes the platform usable by non-experts; a sales differentiator.
- **How:** Call an LLM (Claude/OpenAI) with a DPDPA system prompt + injected tenant
  data. **Start with mock responses**, wire the real API later.
- **Hard parts:** Prompt engineering, context injection, cost control. Isolatable —
  great for one person to own end-to-end.
- **Pages:** ConsentCopilot.

### 5.2 PII Scanner + Anonymisation/Masking — 🔴 Very hard *(~7–12 days)*
- **What:** Connect to the customer's actual databases and **scan for personal
  data** (Aadhaar, PAN, email, phone, health) using regex + patterns, report
  findings, and offer masking/anonymisation strategies (hash, redact, k-anonymity).
- **Why it solves:** Automates "know your data"; finds PII the company forgot about.
- **Hard parts:** Connecting to arbitrary external DBs, large-scale scanning
  (background), accurate detection (false positives), and real data transformation.
  This is the single hardest backend area. **Do a spike first; don't promise dates.**
- **Pages:** PIIScannerDashboard, DataAnonymisation.

### 5.3 Cookie Scanner — 🔴 Very hard *(~6–10 days)*
- **What:** Given a website URL, **crawl it with a headless browser**, detect every
  cookie and tracking SDK, categorize them, and link them to consent purposes.
  Also a public "free scan" acquisition tool.
- **Why it solves:** Cookie consent is part of DPDPA; this finds what to disclose.
- **Hard parts:** Headless-browser crawling (Playwright), handling many sites,
  running it as a background job. Specialized — isolate it.
- **Pages:** CookieScanner, CookieTrackerManager.

---

# PART 3 — Complexity at a glance (sorted hardest → easiest)

| Module | Complexity | Needs jobs? | Est days | Depends on |
|---|---|:---:|---|---|
| PII Scanner + Anonymisation | 🔴 Very hard | ✅ | 7–12 | Data Inventory |
| Cookie Scanner | 🔴 Very hard | ✅ | 6–10 | Consent purposes |
| Breach Manager | 🟠 Hard | ✅ | 5–7 | Jobs, Email |
| Proof Vault | 🟠 Hard | — | 4–6 | Consent |
| Compliance Dashboard + Score | 🟠 Hard | — | 4–6 | Most modules |
| Vajra AI | 🟠 Hard | — | 4–6 (2–3 mock) | (context data) |
| Rights SLA Engine | 🟠 Hard | ✅ | 4–5 | Rights Portal, Jobs |
| Monitoring & Scheduling | 🟠 Hard | ✅ | 4–5 | Jobs |
| Retention + auto-delete | 🟠 Hard | ✅ | 3–4 | Jobs, Inventory |
| Consent Notice Builder | 🟡 Medium | — | 4–5 | Auth |
| Banner + multi-lang + channels | 🟡 Medium | — | 4–5 | Notices |
| Rights Portal (public) | 🟡 Medium | — | 3–4 | Auth |
| Data Inventory & Sources | 🟡 Medium | — | 3–4 | Auth |
| DPIA | 🟡 Medium | — | 3–4 | Auth |
| Children's Data | 🟡 Medium | — | 3–4 | Proof Vault |
| Vendor Risk | 🟡 Medium | — | 3–4 | Auth |
| CISO / Security Safeguards | 🟡 Medium | — | 3–4 | Auth |
| Audit Log | 🟡 Medium | — | 2–3 | Auth |
| Background-jobs infra | 🟠 Hard (infra) | — | 2–3 | Auth |
| File storage + PDF service | 🟡 Medium | — | 3–4 | Auth |
| Workspace & Settings | 🟢 Easy | — | 2–3 | Auth |
| Policy Manager | 🟢 Easy | — | 3–4 | Auth |
| RoPA | 🟢 Easy | — | 2–3 | Auth |

---

# PART 4 — What to build first (the order, and why)

Think in **phases**. Don't start hard modules before their foundations exist.

**Phase 0 — Foundations (right after auth):**
1. Workspace & Settings (warm-up, unblocks branding)
2. Audit Log (so everything after is logged for free)
3. Background-jobs infra (Celery+Redis) — unlocks all time-based modules
4. Shared File storage + PDF helper

**Phase 1 — Consent (core value, the demo centerpiece):**
5. Consent Notice Builder + Purpose Registry
6. Banner Builder + multi-language + channels
7. Proof Vault

**Phase 2 — Rights & Breach (deadline-driven):**
8. Rights Portal (public)
9. Rights SLA Engine
10. Breach Manager

**Phase 3 — Governance (parallel-friendly CRUD):**
11. Data Inventory & Sources · RoPA · DPIA
12. Policy Manager · Vendor Risk · Children's Data · CISO

**Phase 4 — Oversight & AI:**
13. Compliance Dashboard + Score (needs the above to score)
14. Monitoring & Scheduling
15. Vajra AI (mock → real)

**Phase 5 — Specialized spikes (start research early, ship late):**
16. PII Scanner + Anonymisation
17. Cookie Scanner

> **Why this order:** each phase only uses things built in earlier phases, so no
> one is blocked. Consent first because it's the product's core and the best demo.
> The two 🔴 modules are last because they're risky — but have someone *research*
> them in parallel so they're not a surprise at the end.

---
---

# PART 6 — Coordination rules

**Each module is isolated** — its own files under `models/`, `schemas/`,
`routers/`, `services/`. The only **shared files** that cause merge conflicts:

| Shared file | Rule |
|---|---|
| `app/main.py` | Only the `include_router(...)` lines change. Keep them alphabetical; small conflicts, easy to resolve. |
| `app/models/__init__.py` | Everyone adds one import line. Same — keep sorted. |
| `app/core/config.py` + `.env.example` | New settings go at the bottom of the right section; tell the team in chat when you add one. |
| `requirements.txt` | Announce new dependencies so others `pip install -r` again. |
| Alembic migrations | **One migration per feature branch.** Always `git pull` + `alembic upgrade head` before generating a new one, or you get conflicting "heads." This is the #1 source of pain — see `README.md` §4. |

**Workflow per module:** branch → build the 4 files → migration → test on `/docs`
→ register router in `main.py` → PR. **Each PR should be one module.**

**Definition of done for any module:** endpoints visible in Swagger (`/docs`),
tenant-isolated (org A can't see org B), inputs validated by schemas, and a quick
manual test passes. (Tests can come in a later hardening pass.)

---
