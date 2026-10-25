# Vajra — User Manual

A complete, screen-by-screen guide to operating Vajra: from workspace setup and team roles to consent, data protection, data-principal rights, and governance.

> **Production app** → https://dpdpashield-500607.web.app

---

## How to import into Notion

1. Open a Notion page → **⋯ menu → Import → Markdown** and select this file. Or paste it section by section.
2. Tables are spaced with a blank line above them so Notion parses them cleanly — keep that spacing if you edit.
3. Every **Screenshot** quote block is a placeholder. Drop your captured image into that block, then delete the placeholder text.
4. The short paragraph *above* each Screenshot block is the reader-facing description — keep it as the image caption.

---

## How to read this manual

Each screen is documented with the same compact layout, so you always know where to look.

| Label | Meaning |
|-------|---------|
| **Route** | The URL path inside the app |
| **Open** | How to reach the screen from the sidebar |
| Description | Plain-language summary of what the screen does — this is your caption text |
| **Screenshot** *(quote block)* | Placeholder telling you exactly what to capture |
| **Access** | Which roles can act on the screen (when relevant) |
| Tables | Key fields, tabs, roles, or actions for that screen |

---

## Contents

1. Getting Started — Authentication
2. App Shell, Navigation & Roles
3. Quick Start — How to Use
4. Overview
5. Consent Management
6. Integrations
7. Data Protection
8. Data Principal Rights
9. Compliance
10. Governance
11. Settings
12. Team & User Management
13. Vajra AI
14. Public Pages (No Login)
15. Appendix — Roles, URLs & Setup

---

# 1. Getting Started — Authentication

## 1.1 Sign Up

**Route** `/signup`  ·  **Open** App → *Create one* on the login page

Register your organization by entering company details and creating the first **Org Admin** account for your workspace. Passwords must be at least 8 characters. You are signed in automatically after signup.

> **Screenshot** — The full sign-up form: logo, the heading "Create your workspace", all four fields (Company name, Your full name, Work email, Password), and the **Create account** button.

**Key fields**

| Field | Purpose |
|-------|---------|
| Company name | Creates your organization workspace |
| Your full name | Display name for the Org Admin account |
| Work email | Login email for the Org Admin |
| Password | Minimum 8 characters |

**Note** — New workspaces stay in **pending approval** until the Vajra team activates your account. Once approved, the signup user becomes your organization's **Org Admin** with full workspace control.

## 1.2 Pending Approval

**Route** `/pending-approval`  ·  **Open** Shown automatically after signup until approved

After registration, your workspace awaits activation by the Vajra team. Use **Check approval status** to refresh; once approved you enter the platform as **Org Admin** with the full dashboard and setup guide.

> **Screenshot** — The "Account awaiting approval" screen: clock icon, message text, and the **Check approval status** and **Sign out** buttons.

## 1.3 Login

**Route** `/login`  ·  **Open** Default landing page when signed out

Sign in with the email and password created at signup or provided by your administrator. Invited users receive credentials by email, must change their password on first login, and see only the modules their assigned role permits.

> **Screenshot** — The login form: Vajra logo, Email and Password fields, **Forgot password?** link, **Sign in** button, and the **Create one** link.

## 1.4 Forgot Password

**Route** `/forgot-password`  ·  **Open** Login → *Forgot password?*

Enter your work email to receive a password reset link. Check your spam folder if it does not arrive within a few minutes.

> **Screenshot** — The email input field and submit button for the password-reset request.

## 1.5 Reset Password

**Route** `/reset-password` *(with token from email)*  ·  **Open** Click the link in the reset email

Set a new password (minimum 8 characters) using the secure link from your email. The link expires after a single use.

> **Screenshot** — The new-password and confirm-password fields with the submit button.

## 1.6 Change Password (Forced)

**Route** `/change-password`  ·  **Open** Shown when `must_change_password` is set (e.g. invited users on first login)

First-time and invited users must set a new password before they can access the platform.

> **Screenshot** — The change-password form with current and new password fields.

---

# 2. App Shell, Navigation & Roles

## 2.1 Main Layout — Sidebar & Top Bar

**Route** Any authenticated screen (e.g. `/dashboard`)  ·  **Open** Log in with an approved account

The sidebar groups every module. Use **⌘K / Ctrl+K** search to jump to any screen, and collapse the sidebar with the toggle icon. What you can **see** in the sidebar and what you can **do** on each page both depend on your assigned role — see [2.2 Role-Based Access Control](#22-role-based-access-control-rbac).

> **Screenshot** — The full app layout: left sidebar (expanded), top breadcrumb bar, main content area, and the user menu at the bottom of the sidebar showing the current user's role.

**Sidebar sections, top to bottom**

- How to Use
- Overview
- Consent Management
- Integrations
- Data Protection
- Data Principal Rights *(Logs item visible to Org Admin only)*
- Compliance
- Governance
- Settings
- Administration *(Team & Users — Org Admin only)*
- Vajra AI *(bottom button)*

## 2.2 Role-Based Access Control (RBAC)

Vajra ships **12 assignable organization roles** plus the **Org Admin** who manages the workspace. Each role maps to a specific permission set. Permissions control which actions appear on each screen (edit, assign, approve, sign off, close incident, and so on); a few screens are additionally restricted by role.

**How access works**

| Layer | What it controls | What users see |
|-------|------------------|----------------|
| **Permissions** | Buttons and forms within a page (create, edit, assign, approve) | Edit controls hidden or disabled when not permitted |
| **Route guard** | Protected screens (Team & Users, DSAR Activity Log) | Blurred page + Access Restricted modal if the role is not allowed |
| **Read-only role** | Auditor | Can view all modules but cannot save, delete, or submit |

> **Screenshot** — The **Invite user** form with the **Role** dropdown open, showing the role description and permissions-preview panel below the dropdown.

When you invite a user, each role shows a short description and its permission list before you send the invite. Choose the role that matches the person's DPDPA responsibilities — not everyone needs Org Admin access.

**UI note** — The Org Admin role appears as **Admin** in the app's role dropdown.

**Organization roles at a glance**

| Role | Display name in app | Primary responsibility |
|------|---------------------|------------------------|
| `admin` | Admin *(Org Admin)* | Full organization administration — users, settings, all modules |
| `user` | User | Operational DSAR handler for assigned requests |
| `dpo` | Data Protection Officer | Statutory DPO (Sec 9/10) — consent approval, workspace/DPO settings, legal sign-off |
| `it_admin` | IT Admin | Technical infrastructure — integrations, API keys, data sources, retention |
| `ciso` | CISO | Breach closure, security policy override, board-level security view |
| `legal_head` | Legal Head | Final legal sign-off on DSAR responses and consent notices |
| `legal_counsel` | Legal Counsel | Draft DSAR legal responses; review consent notices |
| `compliance_officer` | Compliance Officer | Compliance score, audit-log writes, cross-module task assignment |
| `grievance_officer` | Grievance Redressal Officer | Owns grievance/DSAR SLA tracking and handler assignment |
| `security_analyst` | Security Analyst | Log and triage breach incidents (cannot close) |
| `data_steward` | Data Steward | Approve data-processing changes within assigned departments |
| `auditor` | Auditor | Read-only access across all modules |

### Permission highlights by module

**Data Principal Rights (DSAR / Grievance)**

| Action | Roles with access |
|--------|-------------------|
| View requests | Most roles (read permission) |
| Edit / advance requests | Org Admin, User *(assigned)*, Grievance Officer, roles with `dsar.write` |
| Assign handlers | Org Admin, Grievance Officer |
| Draft legal response | Legal Counsel |
| Legal sign-off | Legal Head, DPO, Org Admin |
| DSAR Activity Log *(route)* | Org Admin, Compliance Officer, DPO, Auditor |

**Consent Management**

| Action | Roles with access |
|--------|-------------------|
| View notices / banners | Roles with `consent.read` |
| Create / edit notices & banners | Org Admin, DPO, roles with `consent.write` |
| Review notices | Legal Counsel |
| Approve / publish notices | Legal Head, DPO, Org Admin |

**Breach Management**

| Action | Roles with access |
|--------|-------------------|
| View incidents | Most roles with `breach.read` |
| Log / triage incidents | Security Analyst, Org Admin |
| Close incidents | CISO, Org Admin |
| Receive escalations | CISO, Org Admin |

**Settings & Workspace**

| Action | Roles with access |
|--------|-------------------|
| Edit workspace info, deployment, industry | Org Admin, DPO, IT Admin *(workspace.manage)* |
| Manage team members | Org Admin only |
| DPDP Role Mapping | Org Admin |

**Compliance Dashboards**

| Action | Roles with access |
|--------|-------------------|
| View dashboards | Most roles |
| Share dashboard / schedule delivery | Org Admin, Compliance Officer, DPO |

**Auditor** can open and read every module, but all create, edit, save, delete, and submit actions are disabled. **Data Steward** approvals apply only within the business units or departments assigned by the Org Admin.

## 2.3 Access Restricted Modal

**Route** Shown automatically when you navigate to a route your role cannot access  ·  **Examples** Team & Users *(non–Org Admin)*, DSAR Activity Log *(unauthorized role)*

If you open a restricted screen, the page appears blurred behind a modal that lists the roles allowed. Click **Go to Dashboard** to return, or **Request Access** to email your administrator. You are never silently redirected — the blurred preview shows what the feature contains.

> **Screenshot** — The **Access Restricted** modal over a blurred page: feature name, your current role badge, **Roles with access** chips, and the **Go to Dashboard** and **Request Access** buttons.

---

# 3. Quick Start — How to Use

## 3.1 Quick Start Guide

**Route** `/how-to-use`  ·  **Open** Sidebar → *How to Use*

Your onboarding roadmap. Complete the 8 steps in order to go from workspace setup to live consent collection. Progress is tracked automatically; click any step to jump to that module.

> **Screenshot** — The Quick Start page: progress ring, the "Get DPDPA-Compliant in 8 Steps" heading, the step cards, and the **Start Next Step** button.

**The 8 steps**

1. Configure Industry Sector → `/settings/industry`
2. Register Website / App Property → `/integrations`
3. Configure Pluggable Provider Adapters → `/consent/provider-adapters`
4. Register Data Collection Purposes → `/consent/purposes`
5. Create & Publish Consent Notice → `/consent/notices`
6. Build & Deploy Consent Banner → `/consent/banner`
7. Configure Multi-Language Translation → `/consent/languages`
8. Monitor & Store Consent Receipts → `/consent/proof-vault`

---

# 4. Overview

## 4.1 Dashboard

**Route** `/dashboard`  ·  **Open** Overview → *Dashboard*

Your compliance command center: real-time score, estimated penalty exposure mitigated, module health, upcoming regulatory deadlines, and recent platform activity. Use **Recalculate** to refresh the score and **Export PDF** for reports.

> **Screenshot** — The full dashboard: compliance-score gauge, penalty-mitigation chip, module-health cards, trend chart, deadlines, alerts, recent activity, and the Vajra AI panel.

## 4.2 Compliance Score

**Route** `/compliance/score`  ·  **Open** Overview → *Compliance Score*

A deep dive into your compliance score by dimension. Identify weak areas and track improvement over time.

> **Screenshot** — The score-breakdown page: overall score, dimension scores, penalty chips, and the recalculate action.

## 4.3 Automation Coverage

**Route** `/overview/automation`  ·  **Open** Overview → *Automation Coverage*

Maps Vajra capabilities to DPDPA statute sections. Switch to the **Rationale** tab to see why each feature satisfies a legal requirement, and export as PDF for audit evidence.

> **Screenshot** — The Coverage Map tab showing DPDPA sections mapped to platform features, plus the Coverage Map / Rationale tab switcher.

---

# 5. Consent Management

> **Recommended order** — Provider Adapters → Purposes → Notices → Banner → Languages → Deploy → Received Consents → Proof Vault

## 5.1 Pluggable Provider Adapters

**Route** `/consent/provider-adapters`  ·  **Open** Consent Management → *Pluggable Provider Adapters*

Register external providers (SMS gateway, email service, database) used for notice delivery and consent campaigns. Required before you configure notice delivery channels.

> **Screenshot** — The adapter list and the add/configure adapter dialog (SMS, email, database, etc.).

## 5.2 Purpose Registry

**Route** `/consent/purposes`  ·  **Open** Consent Management → *Purpose Registry*

Define each lawful purpose for data processing (DPDPA Sec 6). Each purpose needs a legal basis, associated data categories, and a retention period. Purposes appear as checkboxes on consent banners.

> **Screenshot** — The purposes table and the create/edit purpose form showing legal basis, data categories, and retention fields.

## 5.3 Consent Notices Manager

**Route** `/consent/notices`  ·  **Open** Consent Management → *Consent Notices Manager*

Build, edit, publish, and archive consent notices. Each notice can carry multiple versions, and published notices link to banners. Rule 3 warnings appear if the content is incomplete.

> **Screenshot** — The notices list with status badges (Draft, Published, Archived), version history, and action buttons.

**Access**

| Action | Roles |
|--------|-------|
| Edit | Org Admin, DPO, any role with `consent.write` |
| Approve / publish | Org Admin, Legal Head, DPO *(requires `consent.approve`)* |
| Review | Legal Counsel *(requires `consent.review`)* |
| Auditor | Read-only — no create or publish actions |

## 5.4 Create Consent Notice

**Route** `/consent/notices/new`  ·  **Open** Consent Notices Manager → *New Notice*

Build a new consent notice: link registered purposes, write notice text per DPDPA Rule 3, preview, then save as draft or publish.

> **Screenshot** — The notice-creation wizard/form with title, content sections, linked purposes, and publish controls.

## 5.5 Edit Consent Notice

**Route** `/consent/notices/:noticeId/edit/:versionId`  ·  **Open** Notices list → *Edit* on a notice row

Edit an existing notice version. Publishing creates a new live version; previous versions remain in history for audit.

> **Screenshot** — The edit form with the version indicator and save/publish actions.

## 5.6 Create Consent — Banner Builder

**Route** `/consent/banner`  ·  **Open** Consent Management → *Create Consent*

Design and deploy consent banners for your websites and apps. Create banners from templates, attach them to properties, run A/B tests, and track deployment activity.

> **Screenshot** — The Banner Builder dashboard: banner list, design previews, deployment status, and the activity-log tab.

## 5.7 New Banner Wizard

**Route** `/consent/banner/new` *(in-app wizard)*  ·  **Open** Create Consent → *New Banner*

Step-by-step banner creation: select purposes, pick a template, assign the banner to website/mobile properties, configure cookie and tracker blocking before consent, then publish.

> **Screenshot** — One wizard step showing purpose selection, template choice, property assignment, and blocker-mode settings.

## 5.8 Multi-Language Editor

**Route** `/consent/languages`  ·  **Open** Consent Management → *Multi-Language Editor*

Translate consent notices and banners into Schedule VIII languages — required for nationwide compliance. The editor shows completion status per language.

> **Screenshot** — The language list (Eighth Schedule languages) with translation status and the translation-editor panel.

## 5.9 Received Consents

**Route** `/consent/received`  ·  **Open** Consent Management → *Received Consents*

An audit log of all consent events collected from live properties. Filter by date, property, or purpose, and export to a spreadsheet for reporting.

> **Screenshot** — The consent-records table with filters (date, property, purpose), search bar, and the **Export XLSX** button.

## 5.10 Proof Vault

**Route** `/consent/proof-vault`  ·  **Open** Consent Management → *Proof Vault*

Cryptographically chained consent receipts — court-admissible evidence of consent. Verify chain integrity at any time; each receipt links to the notice version and the purposes accepted.

> **Screenshot** — The receipt list with cryptographic-chain status, the verify-integrity button, and the receipt detail panel.

## 5.11 Cookie & Tracker Manager

**Route** `/scanner/cookies/manager`  ·  **Open** Consent Management → *Cookie & Tracker Manager*

Manage discovered cookies and trackers. Categorize them (essential, analytics, marketing) and link them to consent purposes. Launch the Cookie Scanner to discover new trackers.

> **Screenshot** — The cookies/trackers table with categories, domains, and the link to the scanner action.

## 5.12 Cookie Scanner

**Route** `/scanner/cookies`  ·  **Open** Cookie & Tracker Manager → *Scan*

Scan a website domain to automatically discover cookies and third-party trackers, then import the results into the Cookie & Tracker Manager.

> **Screenshot** — The scanner UI: domain input, scan progress, and the results list of discovered cookies/trackers.

## 5.13 Notice Delivery Channels

**Route** `/consent/channels`  ·  **Open** Consent Management → *Notice Delivery Channels*

Configure multi-channel notice delivery for consent collected outside the web banner (email campaigns, SMS, in-app prompts). Requires provider adapters to be set up first.

> **Screenshot** — The channel-configuration cards (email, SMS, in-app) with their linked provider adapters.

## 5.14 Consent Withdrawal Flow

**Route** `/consent/withdrawal`  ·  **Open** Consent Management → *Consent Withdrawal Flow*

Configure how users withdraw consent — withdrawal must mirror the granularity of consent grant (DPDPA Sec 6(4)). Set withdrawal methods and link them to the public portal.

> **Screenshot** — The withdrawal configuration showing grant-vs-withdrawal parity settings and the withdrawal UI preview.

---

# 6. Integrations

## 6.1 Integrations Overview

**Route** `/integrations`  ·  **Open** Integrations → *Integrations Overview*

The central hub for all technical integrations. Shows your active-integration count and quick links to each integration type.

> **Screenshot** — The hub page with integration stats and cards for Website, Mobile SDK, Tag Manager, and API & Webhooks.

## 6.2 Website Integration — Property List

**Route** `/integrations/website`  ·  **Open** Integrations → Technical Integration → *Website*

Register website domains where the consent banner will be deployed. Each property gets its own embed code, API keys, and banner assignments.

> **Screenshot** — The property-list table with domain names, status, and the **Add Property** button.

## 6.3 Website Property Detail

**Route** `/integrations/website/:propertyId`  ·  **Open** Website Integration → click a property row

Full configuration for one website property. Copy the `<script>` embed snippet to your site, manage API keys, attach banners, and track deployment versions.

> **Screenshot** — The property-detail tabs: Embed Code, CMP Script, API Keys, Deployment Targets, Banner Attach, Analytics, Settings.

**Key tabs**

| Tab | Purpose |
|-----|---------|
| Embed Code | `<script>` tag to paste in the website `<head>` |
| CMP Script | Consent Management Platform JS bundle URL |
| API Keys | Server-side and client-side keys |
| Deployment Targets | Staging vs production environments |
| Banner Attach | Link consent banners to this property |
| Analytics | Consent-event metrics for this property |

## 6.4 Mobile SDK Integration

**Route** `/integrations/mobile`  ·  **Open** Integrations → Technical Integration → *Mobile SDK*

Register mobile app properties. Each app gets SDK configuration for iOS, Android, React Native, or Flutter.

> **Screenshot** — The mobile-app property list with platform icons (iOS, Android, React Native, Flutter).

## 6.5 Mobile Property Detail

**Route** `/integrations/mobile/:propertyId`  ·  **Open** Mobile SDK → click a property

Configure the mobile CMP SDK for one app. Copy the integration snippets and API keys into your mobile codebase.

> **Screenshot** — The SDK config panel: bundle ID, API keys, banner assignment, and platform-specific setup instructions.

## 6.6 Tag Manager — Consent Enforcement Engine

**Route** `/integrations/tag-manager`  ·  **Open** Integrations → Technical Integration → *Tag Manager*

Connect Google Tag Manager, Matomo, or Consent Mode v2. Tags are blocked until the user grants consent for the relevant purpose category.

> **Screenshot** — The GTM / Matomo / Consent Mode v2 configuration panel with tag-blocking rules.

## 6.7 API & Webhooks — Developer Console

**Route** `/integrations/api`  ·  **Open** Integrations → Technical Integration → *API & Webhooks*

The developer console for REST/GraphQL integration. Generate API keys, configure webhooks for consent events, and view the public API endpoint documentation.

> **Screenshot** — The API-keys list, webhook endpoints, and API documentation section.

**Public API base** — `https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1`

---

# 7. Data Protection

> **Recommended order** — Follow the Data Protection Guide (`/data-protection/guide`): Connect → Catalogue → Classify → Protect → Lifecycle → Special

## 7.1 Data Protection Guide

**Route** `/data-protection/guide`  ·  **Open** Data Protection → *Data Protection Guide*

The operational guide for data-protection workflows: connect sources → build inventory → scan PII → mask/anonymise → set retention → handle children's data.

> **Screenshot** — The 6-phase guide with phase cards and progress indicators.

## 7.2 Data Sources

**Route** `/data/sources`  ·  **Open** Data Protection → *Data Sources*

Register every data store your organization uses. Test connections and run schema discovery to auto-populate the data inventory.

> **Screenshot** — The sources list (databases, cloud stores, files, APIs, logs) with the **Add Source** and **Test Connection** actions.

## 7.3 Data Inventory

**Route** `/data/inventory`  ·  **Open** Data Protection → *Data Inventory*

The central register of all data assets and processing activities. Track data categories, lawful basis, processors, and DPA (Data Processing Agreement) status per asset.

> **Screenshot** — The inventory tabs: Asset Register, Processing Activities, Processor DPA Tracking.

## 7.4 PII Scanner

**Route** `/scanner/pii`  ·  **Open** Data Protection → *PII Scanner*

Scan registered data sources for personally identifiable information. Results are classified by PII category (name, email, Aadhaar, etc.) for downstream masking and retention.

> **Screenshot** — The scan-job list, the run-scan dialog (select source), and results showing the PII categories found.

## 7.5 Data Masking

**Route** `/data/masking`  ·  **Open** Data Protection → *Data Masking*

Define masking rules per PII category (redact, hash, tokenize). Preview masking on real data before applying it to production systems.

> **Screenshot** — The masking-rules table and the preview panel showing masked vs original data.

## 7.6 Data Anonymisation

**Route** `/scanner/anonymisation`  ·  **Open** Data Protection → *Data Anonymisation*

Run permanent anonymisation jobs for analytics and ML use cases (DPDPA Sec 8). Anonymised data is irreversible — confirm before running.

> **Screenshot** — The anonymisation-job list with status, source, and the irreversibility warning.

## 7.7 Retention Policies

**Route** `/data/retention`  ·  **Open** Data Protection → *Retention Policies*

Set retention periods per data category. The engine flags data past retention for deletion; confirm deletions to maintain an audit trail.

> **Screenshot** — The retention rules per data category with expiry flags, the deletion-confirmation workflow, and the audit trail.

## 7.8 Children's Data

**Route** `/data/children`  ·  **Open** Data Protection → *Children's Data*

Configure how children's personal data is handled: age-verification methods, parental-consent requirements, and processing restrictions as required by DPDPA Section 9.

> **Screenshot** — The age-verification settings, parental-consent workflow, and restricted-processing rules (DPDPA Sec 9).

---

# 8. Data Principal Rights

## 8.1 Rights Portal — Configuration

**Route** `/rights/portal`  ·  **Open** Data Principal Rights → *Rights Portal (Public)*

Configure your public-facing Data Principal Rights portal. Set branding, choose which rights requests are accepted (access, correction, erasure, etc.), and preview the live portal. Typically configured by the Org Admin or Grievance Officer.

> **Screenshot** — The admin configuration panel: portal branding, form fields, OTP settings, and a live preview of the public portal.

**Public URL format** — `https://dpdpashield-500607.web.app/portal/{your-org-slug}`

## 8.2 DSAR SLA Tracker

**Route** `/rights/tracker`  ·  **Open** Data Principal Rights → *DSAR SLA Tracker*

Track all Data Subject Access Requests internally. Monitor SLA deadlines, assign handlers, update status, attach evidence, and export a PDF evidence pack per request.

> **Screenshot** — The DSAR request table with SLA countdown timers, status badges, assignee column, and the **Export Evidence Pack** action.

**Role-specific actions**

| Role | What they can do |
|------|------------------|
| **Org Admin** | Full edit, assign handlers, advance any request |
| **Grievance Officer** | Manage grievance requests, assign handlers |
| **User** | Work on requests assigned to them (in review / response ready) |
| **Legal Counsel** | Draft legal response when status is *Response Ready* |
| **Legal Head / DPO** | Final legal sign-off |
| **Auditor** | View only — no edit or assign controls |
| **Other roles** | View requests; edit only with `dsar.write` or `grievance.manage` |

## 8.3 DSAR Activity Log

**Route** `/rights/logs`  ·  **Open** Data Principal Rights → *Logs* *(sidebar visible to Org Admin)*  ·  **Allowed roles** Org Admin, Compliance Officer, DPO, Auditor

An immutable audit trail of every action on the public rights portal — submissions, OTP verifications, status checks, and admin responses. Compliance Officer, DPO, and Auditor can reach this screen (via search or direct URL) even though the sidebar link shows only for the Org Admin.

> **Screenshot** — The activity-log table with timestamp, action type, user, and request-ID columns.

---

# 9. Compliance

## 9.1 Compliance Guide

**Route** `/compliance/guide`  ·  **Open** Compliance → *Compliance Guide*

A structured compliance workflow mapped to DPDPA obligations. Shows which team roles (DPO, CISO, Legal) own each phase.

> **Screenshot** — The 4-phase guide (Orient → Prevent → Respond → Prove) with the persona-mapping section.

## 9.2 DPDPA Map

**Route** `/compliance/map`  ·  **Open** Compliance → *DPDPA Map*

A visual map of DPDPA statute sections linked to platform features. Green = covered, amber = partial, red = gap. Click any section to see linked modules and remediation steps.

> **Screenshot** — The interactive statute map with section nodes, coverage indicators, and the gap-analysis panel.

## 9.3 Security Safeguards Hub

**Route** `/security/safeguards`  ·  **Open** Compliance → *Security Safeguards*

A security-control checklist mapped to DPDPA Section 8(5) technical and organizational measures. Track implementation status and your overall security-posture score.

> **Screenshot** — The security-controls checklist with DPDPA Sec 8(5) mapping and the posture score.

## 9.4 Breach Disclosure Wizard — Incidents List

**Route** `/breach`  ·  **Open** Compliance → *Breach Disclosure Wizard*

Manage personal-data breach incidents. Create a new incident, track its lifecycle, and launch the disclosure wizard when notification is required.

> **Screenshot** — The incidents list with severity, status, affected data types, and the **New Incident** button.

**Role-specific actions**

| Action | Who can do it |
|--------|---------------|
| View incidents | All roles with `breach.read` |
| Create / edit incidents | Org Admin, Security Analyst *(log/triage)* |
| Triage incidents | Security Analyst, Org Admin |
| Close incidents | CISO, Org Admin |
| Run disclosure wizard | Org Admin, CISO *(escalation receive)* |

## 9.5 Incident Detail

**Route** `/breach/:incidentId`  ·  **Open** Breach list → click an incident

The full incident record with a timeline of events, affected data categories, and the current disclosure status.

> **Screenshot** — The incident timeline, affected data categories, affected-principal count, and status workflow.

## 9.6 Breach Disclosure Wizard — Steps

**Route** `/breach/:incidentId/wizard`  ·  **Open** Incident Detail → *Start Disclosure Wizard*

A step-by-step workflow for breach notification to the Data Protection Board and affected data principals, as required by DPDPA.

> **Screenshot** — One wizard step (e.g. assess severity, draft notification, select recipients, review & submit).

## 9.7 Audit Log

**Route** `/audit/log`  ·  **Open** Compliance → *Audit Log (New)*

An immutable, cryptographically chained audit trail of all platform actions. Verify integrity at any time and export evidence packs for regulatory inquiries.

> **Screenshot** — The audit-log table with the hash-chain indicator, **Verify Integrity** button, and **Export Evidence Pack** action.

---

# 10. Governance

## 10.1 Governance Guide

**Route** `/governance/guide`  ·  **Open** Governance → *Governance Guide*

The governance operating guide covering RoPA, DPIA, policies, vendor risk, and board reporting. Maps modules to responsible roles (DPO, CISO, Legal Counsel).

> **Screenshot** — The module-by-module guide with the "Who Uses What" persona table.

## 10.2 RoPA Module

**Route** `/data/ropa`  ·  **Open** Governance → *RoPA Module*

Maintain your Record of Processing Activities (RoPA). Use AI discovery suggestions to auto-populate entries from the data inventory, with version control and an approval workflow for audit readiness.

> **Screenshot** — The Record of Processing Activities table with AI discovery suggestions, version history, and approval-workflow buttons.

## 10.3 DPIA Module

**Route** `/data/dpia`  ·  **Open** Governance → *DPIA Module*

The Privacy Impact Assessment registry. Create case files for high-risk processing, assess inherent and residual risk, and document mitigation safeguards.

> **Screenshot** — The DPIA case list and an open case detail showing the risk-assessment matrix and mitigation safeguards.

## 10.4 Policy Manager

**Route** `/data/policies`  ·  **Open** Governance → *Policy Manager*

Manage privacy, cookie, and employee policies through a draft → review → publish lifecycle, and track employee acknowledgements for internal policies.

> **Screenshot** — The policies list (Privacy Policy, Cookie Policy, Employee Policy) with draft/review/live status and acknowledgement tracking.

## 10.5 Vendor Risk Intelligence

**Route** `/data/vendors`  ·  **Open** Governance → *Vendor Risk Intelligence*

Third-party processor risk management. Score vendors, track DPA (Data Processing Agreement) status, and review vendors auto-discovered from the data inventory.

> **Screenshot** — The vendor list with risk scores, DPA status, discovered-vendors panel, and the add-vendor form.

## 10.6 Cross-Border Transfer

**Route** `/governance/cross-border-transfer`  ·  **Open** Governance → *Cross-Border Transfer*

Register cross-border data transfers (DPDPA Sec 16). Document legal mechanisms, attach DPA contracts, and flag transfers to negative-list countries.

> **Screenshot** — The transfer-registry table with destination country, legal mechanism, DPA contract status, and negative-list audit flags.

## 10.7 CISO Command Center

**Route** `/security/ciso`  ·  **Open** Governance → *CISO Command Center*

A GRC operating system for CISOs. Track CIS benchmark controls, attach evidence, and generate board-ready PDF reports.

> **Screenshot** — The GRC dashboard: CIS benchmark scores, control-evidence panel, and the **Export Board PDF** button.

## 10.8 Compliance Dashboards

**Route** `/compliance/dashboards`  ·  **Open** Governance → *Compliance Dashboards*

Build custom compliance dashboards with widgets (score, module health, DSAR stats, etc.). Share read-only links with stakeholders or schedule automated email delivery.

> **Screenshot** — The dashboard builder with drag-and-drop widgets, the share-link dialog, and schedule settings.

**Access** — Org Admin, Compliance Officer, and DPO can share or schedule. Other roles can view and build personal dashboards but cannot generate public share links.

---

# 11. Settings

## 11.1 Workspace Info

**Route** `/settings/workspace`  ·  **Open** Settings → *Workspace Info*

Your core organization profile, used across compliance reports and the public rights portal. Keep DPO contact details current — they appear on consent notices and breach notifications.

> **Screenshot** — The workspace form: organization name, address, DPO contact details, India-presence toggle, and SDF (Significant Data Fiduciary) status.

**Access** — Org Admin, Data Protection Officer, and IT Admin *(all hold `workspace.manage`)*. Other roles can view but not save changes.

## 11.2 Deployment Settings

**Route** `/settings/deployment`  ·  **Open** Settings → *Deployment Settings*

Document your deployment architecture for audit purposes: hosting model, data-residency regions, and backup/disaster-recovery arrangements.

> **Screenshot** — The deployment-model selector (Public Cloud / Private / Hybrid / On-Prem), region settings, and backup/DR configuration.

**Access** — Org Admin, DPO, IT Admin.

## 11.3 Industry Config

**Route** `/settings/industry`  ·  **Open** Settings → *Industry Config*

Set your organization's industry sector. Vajra tailors compliance recommendations and SDF classification based on sector and data volume.

> **Screenshot** — The primary/secondary industry-sector selectors and SDF classification settings.

**Access** — Org Admin, DPO, IT Admin.

## 11.4 DPDP Role Mapping

**Route** `/settings/role-mapping`  ·  **Open** Settings → *DPDP Role Mapping*

Map your internal team roles (e.g. Marketing Manager, HR Lead) to DPDPA legal roles (Data Fiduciary, Data Processor, Data Principal) for accountability tracking.

> **Screenshot** — The role-mapping table linking internal job roles to DPDPA fiduciary/processor/data-principal roles.

**Access** — Org Admin only.

---

# 12. Team & User Management

> **Access** — Only the **Org Admin** can invite and manage team members. See [2.2 Role-Based Access Control](#22-role-based-access-control-rbac) for the full role matrix.

## 12.1 Team & Users

**Open** Administration → *Team & Users*  ·  **Allowed roles** Org Admin *(shown as **Admin** in the app)*

The central hub for managing your organization's team. The Org Admin invites colleagues, assigns DPDPA roles, and controls account access. This is typically the first screen you use after your workspace is activated — set up your DPO, IT Admin, Legal, and other roles before rolling out compliance workflows.

> **Screenshot — main screen** — The Team & Users page: title, the subtitle "Admin — invite and manage users in your organization", the **Invite user** button, and the users table (columns: Name, Email, Role, Status, Actions).

> **Screenshot — invite form** — The expanded **Invite user** form: Email, Full name, Role dropdown, the role description + permissions-preview panel, and the **Send invite** button.

Invite a colleague by email and select the appropriate DPDPA role — the preview panel shows exactly what permissions that role grants before you send. Invited users receive a temporary password by email and must change it on first login.

> **Screenshot — user row actions** — A user row showing the inline role dropdown, status (invited / active / disabled), the resend-invite icon (envelope), the Enable/Disable toggle, and the delete action.

Change a user's role anytime via the inline dropdown (except your own row). Disable accounts instead of deleting when someone leaves temporarily, and resend the invite email for users still in **invited** status.

**Available roles when inviting** — assign one role per person based on their DPDPA responsibilities:

| Role in app | When to assign |
|-------------|----------------|
| **Admin** *(Org Admin)* | A second org-wide administrator *(use sparingly — backup admins only)* |
| **User** | Staff who handle assigned DSAR requests day-to-day |
| **Data Protection Officer** | Named statutory DPO — consent approval, workspace settings, legal sign-off |
| **IT Admin** | Infrastructure team — integrations, API keys, data sources, retention *(no user management)* |
| **CISO** | Security lead — breach closure and policy override |
| **Legal Head** | Head of legal — final sign-off on DSAR responses and consent notices |
| **Legal Counsel** | Legal team — draft responses and review notices |
| **Compliance Officer** | Compliance program owner — score, audit writes, task assignment |
| **Grievance Redressal Officer** | Owns grievance SLA tracking and handler assignment |
| **Security Analyst** | SOC team — log and triage breaches, cannot close |
| **Data Steward** | Business-unit owner — approves data changes within their scope |
| **Auditor** | Internal/external auditor — read-only across all modules |

**User statuses**

| Status | Meaning |
|--------|---------|
| `invited` | Invite sent; user has not logged in yet — use the resend icon to re-send |
| `active` | User has logged in and can access the platform |
| `disabled` | Account blocked — re-enable with the **Enable** button |

**Actions reference**

| Action | Notes |
|--------|-------|
| **Invite user** | Sends email with a temporary password |
| **Change role** | Inline dropdown on each row (not on your own account) |
| **Resend invite** | Envelope icon — only for `invited` status |
| **Disable / Enable** | Toggles account access without deleting |
| **Delete** | Permanently removes the user *(confirm dialog)* |

---

# 13. Vajra AI

## 13.1 Vajra AI Copilot

**Route** `/ai/copilot`  ·  **Open** Sidebar bottom → *Vajra AI* button

An AI assistant for DPDPA compliance. Ask questions about any module, get step-by-step guidance, and navigate directly to the relevant screen. Conversation history is saved per session.

> **Screenshot** — The full-screen copilot chat interface with a sample conversation showing navigation suggestions and module links.

---

# 14. Public Pages (No Login)

These pages are used by data principals and external stakeholders — not by platform admins during normal use. They are documented here for completeness.

## 14.1 Public Rights Portal — Landing

**Route** `/portal/{org-slug}`  ·  **Example** `https://dpdpashield-500607.web.app/portal/acme-corp`

The public-facing portal where data principals exercise their DPDPA rights (access, correction, erasure, grievance). No login required — identity is verified via OTP.

> **Screenshot** — The public portal landing page with organization branding and the **Submit a Request** call-to-action.

## 14.2 Public Rights Portal — Request Form

**Route** `/portal/{org-slug}` → Submit a Request

Data principals select their request type, describe their request, and provide contact details. An OTP is sent to verify identity before submission.

> **Screenshot** — The rights-request form with request-type selector, description field, and identity fields.

## 14.3 Public Rights Portal — OTP Verification

**Route** `/portal/{org-slug}` → after form submit

The identity-verification step. The data principal enters the OTP sent to their registered contact method; on success the request is logged in the DSAR SLA Tracker.

> **Screenshot** — The OTP entry screen and the confirmation/success message after verification.

## 14.4 Public Rights Portal — Status Check

**Route** `/portal/{org-slug}` → Check Request Status

Data principals can check the status of a previously submitted request using their request ID and verified contact method.

> **Screenshot** — The status-check form and a sample status result (Submitted / In Progress / Resolved).

## 14.5 Public Compliance Dashboard

**Route** `/compliance/dashboards/public/{token}`  ·  **Open** Generated from Compliance Dashboards → Share link

A read-only compliance dashboard shared via a secure token link — useful for board members, auditors, or regulators who need visibility without platform access.

> **Screenshot** — A shared read-only dashboard as an external stakeholder sees it (no sidebar, no edit controls).

---

# 15. Appendix — Roles, URLs & Setup

## User Roles — Full Reference

Vajra assigns every user one **organization role**. When your organization is onboarded, the person who signed up becomes the **Org Admin** (shown as **Admin** in the app), who then invites all other team members and assigns their roles. Roles map to granular permissions that control both screen access and in-page actions (edit, assign, approve, sign off, close).

**All organization roles**

| Role slug | Display name | Invitable | Summary |
|-----------|--------------|-----------|---------|
| admin | Admin (Org Admin) | Yes, sparingly | Full org administration — users, settings, all modules. Auto-assigned to the signup user on activation. |
| user | User | Yes | Operational handler for assigned DSAR requests. |
| dpo | Data Protection Officer | Yes | Statutory DPO (Sec 9/10). Consent approval, workspace/DPO settings, legal sign-off. |
| it_admin | IT Admin | Yes | API keys, webhooks, data sources, integrations, retention. No user management. |
| ciso | CISO | Yes | Breach closure, security policy override, board security view. |
| legal_head | Legal Head | Yes | Final legal sign-off on DSAR responses and consent notices. |
| legal_counsel | Legal Counsel | Yes | Draft DSAR responses; review consent notices. No final sign-off. |
| compliance_officer | Compliance Officer | Yes | Compliance score, audit writes, task assignment, DSAR Activity Log access. |
| grievance_officer | Grievance Redressal Officer | Yes | Owns grievance/DSAR SLA tracking and handler assignment. |
| security_analyst | Security Analyst | Yes | Log and triage breaches. Cannot close incidents. |
| data_steward | Data Steward | Yes | Approve data changes within assigned departments only. |
| auditor | Auditor | Yes | Read-only across all modules. No write actions. |

**Route-level access (restricted screens)**

| Screen | Allowed roles |
|--------|---------------|
| Team & Users | Org Admin |
| DSAR Activity Log | Org Admin, Compliance Officer, DPO, Auditor |

All other modules are accessible to every active role, with **in-page permissions** controlling which actions are available.

**Permission groups — what each permission unlocks**

| Permission | Unlocks |
|------------|---------|
| `user.manage` | Team & Users screen — invite, change roles, disable/delete |
| `workspace.manage` | Edit Workspace Info, Deployment Settings, Industry Config |
| `consent.write` | Create/edit consent notices, banners, purposes |
| `consent.review` | Review consent notice drafts (Legal Counsel workflow) |
| `consent.approve` | Publish/approve consent notices |
| `dsar.write` | Edit and advance DSAR requests |
| `dsar.assign` | Assign DSAR/grievance handlers |
| `dsar.legal_draft` | Draft legal DSAR response |
| `dsar.legal_signoff` | Final legal sign-off on DSAR response |
| `grievance.manage` | Manage grievance requests end-to-end |
| `breach.log` / `breach.triage` | Create and triage breach incidents |
| `breach.close` | Close breach incidents |
| `compliance.manage` | Edit compliance-score settings, manage the compliance program |
| `audit.write` | Write audit-log entries |
| `security.write` | Edit security safeguards and controls |
| `data_asset.write` | Edit data inventory, sources, masking rules |
| `task.assign` | Assign cross-module compliance tasks |

**Recommended role assignments for a typical organization**

| Person | Suggested role |
|--------|----------------|
| Compliance / privacy program lead | Org Admin *(signup user)* or Compliance Officer |
| Statutory DPO | Data Protection Officer |
| IT / DevOps lead | IT Admin |
| CISO / security head | CISO |
| General counsel | Legal Head |
| Legal team member | Legal Counsel |
| Customer support / grievance desk | Grievance Redressal Officer |
| SOC analyst | Security Analyst |
| Business-unit data owner | Data Steward |
| Internal auditor | Auditor |
| DSAR processing staff | User |

---

## Key URLs

| Resource | URL |
|----------|-----|
| Production app | https://dpdpashield-500607.web.app |
| CMP script | https://dpdpashield-500607.web.app/cmp.js |
| Public API | https://dpdpa-backend-290927690790.asia-south1.run.app/public/v1 |
| Public rights portal | `https://dpdpashield-500607.web.app/portal/{org-slug}` |

---

## Recommended First-Time Setup Flow

1. **Sign Up** — workspace enters pending approval
2. **Activation** — Vajra activates your account
3. **Login as Org Admin** — open **How to Use** (the 8-step guide)
4. **Team & Users** — invite DPO, IT Admin, Legal, CISO, Grievance Officer
5. **Settings** — Workspace, Industry, Deployment *(DPO updates contact details)*
6. **Integrations** — register a website property, copy the embed code
7. **Consent Management** — Adapters → Purposes → Notice → Banner → Languages
8. **Deploy** — monitor Received Consents, verify the Proof Vault
9. **Data Protection** — Sources → Inventory → PII Scan → Retention
10. **Rights Portal** — configure the public portal, monitor the DSAR Tracker
11. **Governance** — RoPA → DPIA → Policies → Dashboards

---

## Screenshot Checklist

Use this while capturing screenshots — roughly **55 screens** in total.

| Group | Screens |
|-------|---------|
| **Auth (6)** | Sign Up · Pending Approval · Login · Forgot Password · Reset Password · Change Password |
| **Shell (3)** | Main Layout · RBAC Invite Role Preview · Access Restricted Modal |
| **Guide (1)** | How to Use |
| **Overview (3)** | Dashboard · Compliance Score · Automation Coverage |
| **Consent (14)** | Provider Adapters · Purpose Registry · Notices List · Create Notice · Edit Notice · Banner Builder · New Banner Wizard · Multi-Language · Received Consents · Proof Vault · Cookie Manager · Cookie Scanner · Notice Channels · Withdrawal Flow |
| **Integrations (7)** | Overview · Website List · Website Property Detail · Mobile List · Mobile Property Detail · Tag Manager · API & Webhooks |
| **Data Protection (8)** | Guide · Data Sources · Data Inventory · PII Scanner · Data Masking · Anonymisation · Retention · Children's Data |
| **Rights (3)** | Portal Configuration · DSAR Tracker · Activity Log |
| **Compliance (7)** | Guide · DPDPA Map · Safeguards · Breach List · Incident Detail · Disclosure Wizard · Audit Log |
| **Governance (8)** | Guide · RoPA · DPIA · Policy Manager · Vendor Risk · Cross-Border · CISO · Dashboards |
| **Settings (4)** | Workspace · Deployment · Industry · Role Mapping |
| **Admin (3)** | Team & Users (main) · Invite Form with Role Preview · User Row Actions |
| **Vajra AI (1)** | Copilot |
| **Public (5)** | Portal Landing · Request Form · OTP · Status Check · Public Dashboard |

---

*Last updated: July 2026 · Vajra — Org Admin & RBAC (12 roles)*
