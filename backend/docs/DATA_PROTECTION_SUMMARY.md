# Data Protection Module — Work Summary

**Module:** Data Protection (Vajra)
**Status:** Implemented and working ✅

---

## What this module does

It helps an organisation **find the personal data it holds, understand it, and
protect it** — exactly as the DPDPA law requires. Everything is connected into one
simple flow.

## How it works — the flow

1. **Connect a data source** → add your database (PostgreSQL / MySQL / MongoDB).
   Credentials are stored securely and the connection is verified.
2. **Discover the data** → the system reads all tables and columns automatically
   into a central **Data Inventory**.
3. **Find the personal data** → the **PII Scanner** checks the actual data and
   marks which columns hold personal or sensitive information (Aadhaar, PAN, email,
   phone, etc.).
4. **Protect it** →
   - **Data Masking** hides sensitive values (e.g. `98••••••10`).
   - **Data Anonymisation** removes personal details from free text.
   - **Retention Policies** automatically delete or anonymise data once it's too
     old.
   - **Children's Data** finds users under 18, tracks parental consent, and blocks
     ad-targeting/profiling on them.

---

## Features delivered

| Feature | What it does |
|---|---|
| **Data Sources** | Securely connect company databases and verify them. |
| **Data Inventory** | Auto-built catalogue of every table/column and its data type. |
| **PII Scanner** | Automatically detects personal & sensitive data, including Indian IDs (Aadhaar, PAN, UPI, IFSC). |
| **Data Masking** | Configurable hiding of sensitive data, with live preview and direct apply. |
| **Data Anonymisation** | Removes personal information from free text. |
| **Retention Policies** | Automatic, scheduled deletion/anonymisation of expired data, fully audited. |
| **Children's Data** | Detects minors, manages parental consent, and enforces child-protection rules. |

All seven features are **built, connected end-to-end, and working on real data.**

---

## Next steps

- **Performance optimisation** of large-scale scans and processing.
- **Full end-to-end testing** across all features — planned for the **final week**.

---

*Prepared by: Nikit*
