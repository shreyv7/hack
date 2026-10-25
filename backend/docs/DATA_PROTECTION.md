# 🛡️ Data Protection Module — Complete Guide

> Plain-language documentation of everything built in the **Data Protection**
> section of Vajra. Written so that someone with **no technical background**
> can follow it. Last updated: 2026-06-11.

---

## A tiny glossary first (so the rest makes sense)

| Word | What it means in simple terms |
|---|---|
| **PII** | "Personally Identifiable Information" — any data that points to a real person: name, email, phone, Aadhaar, PAN, address, etc. |
| **Personal data** | Same idea — data about an identifiable person. |
| **Sensitive data** | Extra-private personal data: Aadhaar, health, financial/bank, biometric. Needs stronger protection. |
| **Data source** | A place where a company keeps its data — usually a database (PostgreSQL, MySQL, MongoDB), but could be cloud storage or an app. |
| **Table / column** | A database stores data in **tables** (like spreadsheets). Each table has **columns** (like "email", "phone") and **rows** (one row = one person/record). |
| **Schema** | The "table of contents" of a database — the list of its tables and columns, without the actual data. |
| **Masking** | Hiding part of a value so it's not fully readable, e.g. `9876543210` → `98••••••10`. Usually for display. |
| **Anonymisation** | Removing/scrambling personal data so a person can **no longer be identified** (often permanent). |
| **Retention** | How long you keep data. The law says: delete data once you no longer need it. |
| **DPDPA** | India's privacy law (Digital Personal Data Protection Act, 2023). It's why this module exists. |

---

# PART 1 — The big picture: how an organisation uses this

Think of Data Protection as answering three questions, in order:

1. **Where is our data?** → *Data Sources*
2. **What's inside it, and which parts are personal/sensitive?** → *Data Inventory* + *PII Scanner*
3. **Now protect it** → *Data Masking*, *Data Anonymisation*, *Retention Policies*, *Children's Data*

### The typical journey, step by step

```
STEP 1  Connect your database
        → Data Sources: add your PostgreSQL/MySQL/MongoDB (with login details).
          The password is encrypted. Click "Test connection" to confirm it works.

STEP 2  Discover what's inside
        → Click "Scan schema" on that source. The system reads every table and
          column and writes them into the Data Inventory automatically.
          (No typing by hand.)

STEP 3  Find the personal data
        → Run the PII Scanner on the source. It looks at real values in each
          column and decides "this column holds emails", "this one holds Aadhaar",
          etc. — and labels them in the Data Inventory as Personal or Sensitive.

STEP 4  Protect it
        → Data Masking: decide how each kind of PII is hidden (e.g. hash Aadhaar,
          mask email). Preview it on real data.
        → Data Anonymisation: paste free text (like support notes) and the system
          removes names, emails, locations, etc.
        → Retention Policies: set rules like "delete orders after 7 years"; the
          system finds expired records and (when you approve) deletes them.
        → Children's Data: auto-find users under 18, track parental consent, and
          block ad-targeting/profiling on them.

STEP 5  Prove it / keep it running
        → Every scan and deletion is logged. Retention runs automatically on a
          schedule. The enforcement API lets your other systems ask
          "is this person allowed to be ad-targeted?" before they act.
```

**In one sentence:** connect a database → the platform maps it, finds the personal
data, and then helps you mask it, delete it on time, and protect children — with
most of it happening automatically once a source is connected.

---

# PART 2 — Every option explained

For each one: **what it is**, **why it exists**, **how it works**, **is it
finished?**, and **what you get out of it**.

---

## 2.1 Data Sources

**What it is:** the address book of *where your data lives*. You register each
database here once.

**Why it exists:** you can't protect, scan, or delete data if the platform
doesn't know where it is. Everything else depends on this.

**How it works (simple):**
- You click "Add Source", choose the type (PostgreSQL / MySQL / MongoDB / and a few
  metadata-only ones), and enter the connection details (host, database name,
  username, password).
- The **password is encrypted** before it's stored, so even someone reading the
  database can't see it.
- **"Test connection"** actually connects to your database and confirms it's
  reachable.
- **"Scan schema"** reads the list of tables and columns and sends them to the
  Data Inventory.

**Is it finished?** ✅ **Yes, fully working** for PostgreSQL, MySQL, and MongoDB
(connect, test, scan). Cloud types (S3, BigQuery, Snowflake, Salesforce) can be
*saved* but not yet connected — they're different kinds of systems and were
deliberately left for later.

**What you achieve:** one secure, central place listing every system that holds
personal data — the foundation for the whole module.

---

## 2.2 Data Inventory

**What it is:** the *catalogue* of what's inside your sources — every table, every
column, and a label saying whether each column is Personal, Sensitive, or
Non-personal.

**Why it exists:** the law (and auditors) expect you to **know what personal data
you hold and where**. You also can't honour "delete my data" requests or report a
breach properly without this map.

**How it works (simple):**
- When you "Scan schema" on a source, the inventory **fills itself in** — one entry
  per table, with all its columns.
- A first-pass guess is made from column **names** (a column called `email` is
  probably Personal). Later, the PII Scanner upgrades these guesses by looking at
  the actual data.
- You can also add/edit entries by hand and tag columns yourself.
- Summary cards show totals: how many assets, how many Personal/Sensitive columns.

**Is it finished?** ✅ **The "Asset Register" (the core) is fully working.** Note:
the same screen has two other tabs — "Processing Activities" and "Processor DPA" —
those belong to **separate future modules** (RoPA and Vendor Risk) and are still
showing sample data.

**What you achieve:** a living map of all your personal data that updates itself
when you scan, and feeds every other tool (scanner, retention, children).

---

## 2.3 PII Scanner

**What it is:** an automatic detective that looks at the **real values** in your
database columns and decides which ones contain personal data.

**Why it exists:** column names lie. A column called `notes` or `remarks` might be
full of phone numbers. The scanner checks the actual contents, not just the name.

**How it works (simple):**
- You pick a connected database and start a scan.
- It takes a **sample of rows** from each table and checks each column's values
  against patterns: Is this an email? A phone number? An Aadhaar? A PAN? A credit
  card? An IP address?
- For Indian IDs it uses **checksums** (a maths check built into Aadhaar and card
  numbers) so a random 12-digit number isn't wrongly flagged as Aadhaar.
- If most values in a column match one type, it records a **finding** and
  **updates the Data Inventory** label automatically (e.g. marks the column
  Sensitive / "aadhaar").
- You review the findings and can **dismiss** any false alarms (which undoes the
  label).
- Scans now run **in the background**, so scanning a big database won't freeze the
  screen.

**Is it finished?** ✅ **Working** for structured database columns. **Limitation:**
it only scans **columns** (structured data); free-text paragraphs are handled by
the *Data Anonymisation* tool instead. It also samples rows (not every single row),
so it's fast but could miss PII hiding in unsampled rows.

**What you achieve:** you discover personal data you forgot you had, with the
inventory labels corrected from guesses to **verified facts** — automatically.

---

## 2.4 Data Masking

**What it is:** a tool that **hides parts of personal data** so it's safe to show
or share, while keeping it usable. Example: `priya@acme.com` → `p••••@acme.com`.

**Why it exists:** staff, dashboards, and test systems often don't need to see full
personal data. Masking reduces risk while keeping things working.

**How it works (simple):**
- You set a **rule per type of PII**: e.g. emails → mask, Aadhaar → hash (scramble
  permanently), phone → show last 2 digits only.
- Six methods are available: **Mask** (partial hide), **Redact** (replace with
  `[REDACTED]`), **Hash** (one-way scramble), **Replace** (with a token like
  `<EMAIL>`), **Encrypt** (reversible), **Generalize** (reduce precision, e.g. a
  birth date → just the year).
- "**Try a value**" lets you type anything and see it masked instantly.
- "**Preview on a column**" pulls real sample values from your database and shows
  **before → after**, so you can see exactly what a rule does.
- The actual masking is powered by **Microsoft Presidio** (a trusted open-source
  privacy library), not home-made code.

- **"Apply to database"**: an optional, opt-in button that **permanently rewrites
  the column's values in your live database** using the chosen rule. It pops a
  confirmation warning first (it can't be undone), and for SQL databases it needs
  an id column to update each row safely.

**Is it finished?** ✅ **Working** — both *preview* and the real *apply to
database*. Applying is deliberately gated behind an explicit confirmation because
it changes live data and is irreversible (especially for hash/redact).

**What you achieve:** a clear, configurable policy for how each kind of personal
data is hidden, with live previews on your own data.

---

## 2.5 Data Anonymisation

**What it is:** a tool that reads **free-form text** (support tickets, notes,
documents) and **removes the personal data** from it.

**Why it exists:** lots of personal data hides inside sentences — "Call Priya in
Mumbai on 9876543210". The PII Scanner handles neat columns; this handles messy
text.

**How it works (simple):**
- You paste a block of text and click "Anonymise".
- It uses **Microsoft Presidio's AI** (a language model that recognises names,
  places, organisations) **plus** our India-specific rules for Aadhaar, PAN, and
  Indian phone numbers.
- It returns the text with personal bits replaced by tags, e.g.
  `<PERSON>, PAN <PAN>, call <PHONE_NUMBER> in <LOCATION>`, and lists what it found.

**Is it finished?** ✅ **Working.** It's as accurate as the underlying model (the
small free model is good but not perfect — it can occasionally mislabel a word).
It anonymises text you paste in; wiring it to automatically clean a whole database
column in bulk is a later enhancement.

**What you achieve:** safe, de-identified text you can use for analytics, sharing,
or storage — covering the personal data that lives in sentences, not columns.

---

## 2.6 Retention Policies

**What it is:** rules for **how long you keep data**, plus automatic deletion of
data that's too old.

**Why it exists:** DPDPA says delete personal data once its purpose is over. Keeping
data forever is a violation (and a risk).

**How it works (simple):**
- You create a policy: e.g. "Customer orders → keep 7 years from creation date →
  then delete." You can point it at a specific source + table + date column.
- **"Run dry-run"**: the system **counts** how many rows are past their limit —
  but deletes **nothing**. You see the number first.
- For deletion policies you then click **"Execute delete"** (with a confirmation
  warning) to **permanently delete** those rows. Other actions (anonymise/archive)
  are just acknowledged for the record.
- Policies marked **"auto-delete"** are run **automatically by a background engine**
  (it checks roughly daily) — for those, deletion happens without a human each
  time.
- Every run is saved in a **deletion audit trail** with a certificate reference, so
  you can prove to an auditor what was deleted and when.

**Is it finished?** ✅ **Working**, including **real deletion** and the automatic
scheduler. **Safety rule:** nothing is ever deleted unless the policy's action is
"delete", it has a proper target configured, and either a human clicks Execute or
the policy is explicitly set to auto-delete. **Note:** the "anonymise" and
"archive" actions are recorded but don't yet transform data in place (only "delete"
actually acts).

**What you achieve:** automatic, audited clean-up of old data — meeting the law's
"delete when done" rule without anyone remembering to do it manually.

---

## 2.7 Children's Data

**What it is:** special protection for users **under 18**, as required by DPDPA
Section 9.

**Why it exists:** the law has strict rules for children: you need **verifiable
parental consent**, and you must **not profile them or target ads at them**.
Breaking this carries the heaviest penalties.

**How it works (simple):**
- **Auto-detect:** point it at a database; it finds the date-of-birth column (from
  the inventory) and flags every row where the person is under 18 — creating a
  child record automatically. (You can also add records by hand.)
- Each child record tracks **parental consent status** (missing / pending /
  verified) and two protection switches: **block profiling** and **block ad
  targeting** (both ON by default).
- **"Record consent"** captures the parent's details and verification method and
  marks consent as verified.
- **Enforcement Decision API:** your other systems (marketing, ads) can ask the
  platform *"is this person allowed to be ad-targeted / profiled / processed?"* and
  get a yes/no answer based on the law — e.g. ad-targeting a minor is always
  blocked; processing needs verified parental consent. There's a built-in tester
  panel to try it.

**Is it finished?** ✅ **Working**, including auto-detection and the enforcement
decision API. **Notes:** the consent record isn't yet stored in the tamper-proof
"Proof Vault" (a separate module), there's no automatic email campaign to parents
yet, and the enforcement API currently uses a normal login rather than a dedicated
machine key for external systems.

**What you achieve:** you can find the children in your user base, prove you have
parental consent, and actually **enforce** the no-profiling / no-ad-targeting rules
through a decision other systems can call.

---

# PART 3 — Honest status: what's left to be truly enterprise-grade

Everything above **works end-to-end** and is wired to real data (no fake buttons in
the seven modules themselves). But to call the whole thing "production-grade for a
large enterprise, with nothing partial", these items remain:

### Connectors (breadth)
- **MySQL & MongoDB** are coded but **not yet tested against real servers** (only
  PostgreSQL has been tested live). Needs a real MySQL/Mongo to confirm.
- **S3, BigQuery, Snowflake, Salesforce** connectors are **not built** — each is a
  different kind of system and a separate project.

### PII Scanner (depth)
- Scans **sampled rows**, not the full table — could miss PII in unsampled rows.
  Enterprise-grade needs full or smarter (statistical) sampling.
- Detects **structured columns** only; free-text detection lives in the
  Anonymisation tool and isn't fed back into the scanner's inventory yet.
- Detector list is solid but could grow (passport, voter ID, driving licence, GST,
  bank/IFSC, health terms).

### Masking & Anonymisation
- **Masking can now apply to the live database** (per column, with confirmation).
  Still missing: producing a fully masked **exported copy** (vs editing in place),
  and applying across many columns in one go.
- **Anonymisation** transforms text you paste in; auto-cleaning a whole database
  column of free text in bulk is not wired yet.
- Anonymisation uses the **small** language model; a larger model would be more
  accurate.

### Retention (completeness)
- **Delete** and **anonymise** actions now execute for real (anonymise masks the
  personal columns of expired rows in place). **Archive** is still recorded only —
  it needs an external destination (cold storage) which isn't built.
- Deletion **certificates** are referenced but not generated as downloadable PDFs.

### Children's Data
- Parental consent is **not yet written to the Proof Vault** (tamper-proof evidence
  store — a separate module).
- No **automatic email campaign** to collect parental consent.
- The "age verification methods" and "restricted purposes" panels on the screen are
  **static reference** (not yet configurable settings).

### Cross-cutting (applies to all seven)
- **Audit Log** — recording *who did what, when* across every action. This belongs
  to the **Compliance module (a teammate's work)** and isn't merged in yet; once it
  is, our actions should write to it.
- **Evidence-pack PDF exports** — the "Export evidence pack" buttons are not wired
  to real PDF generation yet.
- **Enforcement API key** — ✅ done: external systems can now call the enforcement
  decision at `POST /public/v1/childrens-data/enforce` with an `X-Api-Key` header
  (no human login needed).
- **Secret key management** — data-source passwords are encrypted, but the
  encryption key currently falls back to being derived from the app secret;
  production should use a dedicated, rotated key (or a secrets manager).
- **Automated tests** — the modules are verified manually; a proper test suite is
  still to be written.

### One-line summary
> The seven Data Protection tools are **built and working on real data**, connected
> together into one pipeline (source → inventory → scan → protect). To be fully
> enterprise-grade, the main gaps are: **more database connectors (tested),
> full-table scanning, "apply for real" masking/anonymisation, the remaining
> retention actions, Proof-Vault + email for children, and the cross-cutting audit
> log, PDF evidence, API-key auth, and automated tests.**
