# Compliance Score — Calculation Reference

This document is the **authoritative implementation reference** for how the DPDPA Compliance Score is computed in CMP-DPDP. It reflects the live logic in:

- `backend/app/services/compliance_map_service.py`
- `backend/app/scripts/seed_compliance_map.py`
- `backend/app/services/security_safeguards_service.py` (auto-seeded controls)

For UI specifications, API response shapes, and QA matrices, see [compliance_score.md](./compliance_score.md).

---

## 1. Executive summary

The compliance score is **not** a simple percentage of configured settings. It is a **penalty-weighted average** of per-statute-section completion rates, minus optional **RoPA deductions**.

A fresh organization often shows a **single-digit score (roughly 2–10%)** even when no consent notices, DSARs, or RoPA activities exist. That is expected: the engine compares org evidence against a **reference catalog** of 150+ mapped controls across 19 DPDPA statute sections. Only **five evidence routes** contribute real counts; everything else stays at zero until the corresponding module is used.

---



## 2. Why the score is ~10% with “empty” org data



### 2.1 Reference catalog vs org evidence


| Layer                 | What it is                                                                       | Scope                             |
| --------------------- | -------------------------------------------------------------------------------- | --------------------------------- |
| **Reference catalog** | `dpdpa_statute_sections` + `DEFAULT_SECTION_FEATURES` / `dpdpa_feature_mappings` | Platform-wide; same for every org |
| **Org evidence**      | Live row counts from five routes (see §4)                                        | Per organization                  |


The score measures **how much of the statutory control checklist has backing evidence in this org**, not whether the platform *can* satisfy a section.

### 2.2 What “empty org” still has

Even with no user-created compliance artifacts, two bootstrap paths often run:

1. **Security Safeguards Hub** (`GET /api/compliance/safeguards`) calls `_seed_controls()` on first access and inserts seven default controls from `DEFAULT_SECURITY_CONTROLS`. Two are `documented`; five are `partial` or `missing`.
2. The same safeguards call runs `AuditLogService.ensure_initialized()`, which creates one system audit entry (“Audit log initialized”) if the org has no audit rows yet.

That yields:

- `security-safeguards-hub` evidence count = **2** (documented controls only)
- `audit-log` evidence count = **1** (after safeguards or audit module init)

No other evidence routes return counts until the org creates notices, receipts, verified DSARs, etc.

### 2.3 Why the percentage stays low

1. **Large denominator** — Section **2-8** (General obligations) alone maps **24** controls; **2-6** (Consent) maps **18** DB-backed features. Most routes in those lists (`banner-builder`, `ropa-module`, `data-inventory`, …) have **zero** evidence on a fresh org.
2. **Binary completion** — A control is either complete or not; partial safeguard checklist progress does not count unless status is `documented`.
3. **Penalty weighting** — High-penalty sections (₹250 Cr) with 0% scores dominate the weighted average.
4. **Section 2-6 stricter rule** — DB features use `implementation_status == "implemented" AND count > 0`. Catalog features marked `implemented` still require evidence; they do not auto-complete.

**Typical fresh-org results:**


| Evidence state                                        | Approx. overall score |
| ----------------------------------------------------- | --------------------- |
| No modules opened (no seeded controls, no audit init) | **0%**                |
| Safeguards hub visited only (2 documented controls)   | **~2%**               |
| Safeguards + audit log initialized (common path)      | **~7%**               |


The “~10%” figure is a practical ballpark for a **new org that has only opened Security Safeguards** (and inherited audit init): non-zero, but far below “Good Standing” because the catalog is broad and evidence is narrow.

---



## 3. Auto-seeded security controls

On first `GET /api/compliance/safeguards`, `SecuritySafeguardsService._seed_controls()` inserts `DEFAULT_SECURITY_CONTROLS` if the org has no `security_controls` rows:


| control_key         | name                              | status         | items_completed / items_total |
| ------------------- | --------------------------------- | -------------- | ----------------------------- |
| `encryption`        | Encryption at Rest and in Transit | **documented** | 4 / 4                         |
| `access_mfa`        | Access Controls & MFA             | **documented** | 4 / 4                         |
| `logging`           | Logging & Monitoring              | partial        | 3 / 5                         |
| `deletion`          | Secure Data Deletion              | partial        | 2 / 4                         |
| `vuln_mgmt`         | Vulnerability Management          | missing        | 0 / 3                         |
| `incident_response` | Incident Response Plan            | missing        | 0 / 4                         |
| `bcp_dr`            | Business Continuity & DR          | partial        | 2 / 4                         |


**Scoring impact:** Compliance score evidence for route `security-safeguards-hub` counts only controls with `status == documented`. Seeding therefore contributes **2**, not 7, to evidence counts.

Sections that reference `security-safeguards-hub` in the catalog (e.g. **2-8**, **2-10**, **7-32**) receive credit for each mapped feature whose route resolves to that evidence — but only while `count > 0` for documented controls.

---



## 4. Evidence routes (five only)

`_evidence_for_route()` in `compliance_map_service.py` returns live counts for **exactly five** route keys. All other routes return `(0, None)`.


| Route key                 | Evidence query                                             | Counts when                   |
| ------------------------- | ---------------------------------------------------------- | ----------------------------- |
| `consent-notices-manager` | `ConsentNoticeVersion` rows for org notices                | ≥ 1 notice version exists     |
| `proof-vault`             | `ConsentReceipt` rows for org                              | ≥ 1 consent receipt exists    |
| `audit-log`               | `AuditLogEntry` rows for org                               | ≥ 1 audit entry exists        |
| `dsar-sla-tracker`        | `DataRightsRequest` with `verification_status == verified` | ≥ 1 verified DSAR exists      |
| `security-safeguards-hub` | `SecurityControl` with `status == documented`              | ≥ 1 documented control exists |


**Not scored via evidence today:** `banner-builder`, `ropa-module`, `data-inventory`, `dpia-module`, `policy-hub`, `deployment-settings`, and all other `PAGE_ROUTE_PATHS` keys — they appear in the breakdown UI with configure links, but contribute **0** evidence until wired to a counting query.

---



## 5. Scoring formulas



### 5.1 Per-section score

For each `dpdpa_statute_section` where `coverage_status != "na"`:

1. Resolve feature list:
  - If `dpdpa_feature_mappings` rows exist for the section (only **§6 / key** `2-6` is seeded in migration), use DB rows.
  - Otherwise use `default_features_for_section(section_key)` from `seed_compliance_map.py`.
2. For each feature `(name, route, implementation_status)`:
  - `count = _evidence_for_route(org_id, route)`
  - **DB features:** `complete = (implementation_status == "implemented") AND (count > 0)`
  - **Default catalog features:** `complete = (count > 0)`
  - Fallback when no feature rows but `feature_count > 0`: `completed = 0`, `total = feature_count`
3. **Section score:**

```
section_score = round(controls_completed / controls_total × 100)
```

1. **Section status** (breakdown badge):


| Score | `status` value | UI label  |
| ----- | -------------- | --------- |
| ≥ 80  | `compliant`    | Compliant |
| 60–79 | `minor`        | Minor Gap |
| < 60  | `risk`         | At Risk   |




### 5.2 Overall score (penalty-weighted)

```
weighted_sum = Σ (section_score × weight)
weight_sum   = Σ weight
raw_overall  = round(weighted_sum / weight_sum)

overall_score = max(0, raw_overall − ropa_deductions)
```

**Section weight:** `penalty_crores` for that statute section, or **1** if `penalty_crores` is `NULL`.

High-penalty sections (e.g. ₹250 Cr for §1-2, §2-8) influence the overall score more than low-penalty rights sections (₹50 Cr).

### 5.3 RoPA deductions

After the weighted average, points are subtracted for **published** RoPA processing activities (`ProcessingActivity.status == "published"`, not deleted):


| Condition                                                       | Deduction            |
| --------------------------------------------------------------- | -------------------- |
| Activity has a **special** data category and **no** linked DPIA | **−10** per activity |
| Activity has **no** lawful bases                                | **−5** per activity  |


Deductions are capped at zero: `max(0, score − deductions)`.

RoPA issues do not change per-section scores in the breakdown; they only reduce `overall_score` and map summary.

### 5.4 Status labels (overall)

```python
if score >= 80:  "Good Standing"
if score >= 60:  "Needs Attention"
else:            "At Risk"
```



### 5.5 Penalty exposure

Computed in `_penalty_from_breakdown()` for sections with non-null `penalty_crores`:

```
worst_case_crores = Σ penalty_crores

residual_crores   = Σ penalty_crores × (100 − section_score) / 100

mitigated_crores  = round(worst_case_crores − residual_crores)
```

Interpretation:

- **worst_case** — Sum of maximum Schedule-style penalties across scored sections.
- **mitigated** — Estimated penalty **avoided** by current section-level completion (higher section scores → higher mitigated value).
- Exposure remaining ≈ `worst_case − mitigated` (residual risk).

Gap severity in breakdown: `high` if `penalty_crores >= 150`, else `medium`.

---



## 6. Worked example — safeguards-only evidence

**Assumptions:** New org; user opened Security Safeguards once; no notices, receipts, DSARs, or RoPA activities; audit log not initialized.

**Evidence counts:**


| Route                     | Count |
| ------------------------- | ----- |
| `security-safeguards-hub` | 2     |
| All others                | 0     |


**Sections with non-zero scores:**


| Section | Title                      | Completed / Total | Score | Penalty (₹ Cr) |
| ------- | -------------------------- | ----------------- | ----- | -------------- |
| 2-8     | General obligations        | 4 / 24            | 17%   | 250            |
| 2-10    | Significant Data Fiduciary | 1 / 11            | 9%    | 250            |
| 7-32    | Penalty provisions         | 1 / 8             | 12%   | 250            |


The four **2-8** completions are the four distinct features mapped to `security-safeguards-hub` (hub, encryption, access/MFA, logging & monitoring). Each checks the same evidence route; `count = 2 > 0`, so all four mark complete.

**Weighted overall:**

```
weighted_sum = (17 × 250) + (9 × 250) + (12 × 250) = 9,500
weight_sum   = 3,854   # sum of penalty_crores (or 1) for all 19 scored sections
raw_overall  = round(9,500 / 3,854) = 2
```

**With audit log initialized** (one entry, e.g. after safeguards visit): additional sections pick up `audit-log` features → overall rises to roughly **7%**.

**Penalty exposure (safeguards-only):**

```
worst_case  = 2,600 Cr   # all penalized sections at 0% except three partial
mitigated   ≈ 95 Cr      # small credit from §2-8, §2-10, §7-32 partial scores
```

This illustrates why the dashboard can show meaningful “penalty mitigated” rupee values while the percentage gauge remains **At Risk**.

---



## 7. API endpoints

Base prefix: `/api` (`settings.API_V1_PREFIX`). All routes require authentication unless noted.


| Method | Path                                | Service method         | Description                                                                                       |
| ------ | ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/compliance/score`             | `get_compliance_score` | Overall score, status label, penalty chips, week delta, days since breach                         |
| `GET`  | `/api/compliance/score/breakdown`   | `get_score_breakdown`  | Per-section scores, controls, gaps, configure routes                                              |
| `GET`  | `/api/compliance/score/trend`       | `get_score_trend`      | Historical points (`days` query 7–365, default 90); approximated from point-in-time recomputation |
| `POST` | `/api/compliance/score/recalculate` | `recalculate_score`    | **Admin / superadmin** — updates map review timestamp and returns fresh score                     |
| `GET`  | `/api/compliance/map/summary`       | `get_summary`          | Same score + penalty fields as map summary                                                        |
| `GET`  | `/api/compliance/safeguards`        | `get_safeguards`       | Triggers control seeding; affects `security-safeguards-hub` evidence                              |


Optional query parameter on all: `org_id` (UUID) for multi-org admin contexts.

**Related dashboard surface:** `GET /api/dashboard/summary` embeds `compliance_score` and `compliance_status` from the same `ComplianceMapService.get_summary()`.

### Response highlights

`GET /api/compliance/score`

```json
{
  "overall_score": 2,
  "status_label": "At Risk",
  "penalty_mitigated_crores": 95,
  "penalty_worst_crores": 2600,
  "last_calculated_at": null,
  "score_delta_week": null,
  "days_since_incident": null
}
```

`GET /api/compliance/score/breakdown` — array of sections with `section_key`, `score`, `status`, `controls_completed`, `controls_total`, `penalty_crores`, `controls[]`, `gaps[]`.

---



## 8. How to verify score for an organization



### 8.1 API verification

1. Authenticate as a user in the target org (or pass `org_id` as admin).
2. `GET /api/compliance/score/breakdown` — inspect each section’s `controls_completed` / `controls_total`.
3. Cross-check evidence sources:
  ```sql
   -- Documented safeguards (security-safeguards-hub)
   SELECT count(*) FROM security_controls
   WHERE organization_id = :org_id AND status = 'documented';

   -- Audit log (audit-log)
   SELECT count(*) FROM audit_log_entries WHERE organization_id = :org_id;

   -- Notice versions (consent-notices-manager)
   SELECT count(*) FROM consent_notice_versions v
   JOIN consent_notices n ON n.id = v.notice_id
   WHERE n.organization_id = :org_id;

   -- Consent receipts (proof-vault)
   SELECT count(*) FROM consent_receipts WHERE organization_id = :org_id;

   -- Verified DSARs (dsar-sla-tracker)
   SELECT count(*) FROM data_rights_requests
   WHERE organization_id = :org_id AND verification_status = 'verified';
  ```
4. `GET /api/compliance/score` — confirm `overall_score` matches manual weighted calculation minus RoPA deductions.
5. Publish a RoPA activity with special data and no DPIA — expect **−10** on next score read.



### 8.2 UI verification

1. Open `/compliance/score` (Compliance Score Deep Dive).
2. Expand low-scoring sections; confirm “Configure” links match `configure_route` from breakdown.
3. Complete evidence in a module (e.g. publish a notice version) and recalculate (admin) or refresh — section score should increase when the corresponding evidence route count becomes > 0.



### 8.3 Automated smoke test

`backend/app/scripts/test_dashboard_api.py` exercises `GET /compliance/score`, `/breakdown`, and `/trend` and prints `overall_score` / `compliance_score`.

---



## 9. Statute section inventory

Seeded in `STATUTE_SECTIONS` (`seed_compliance_map.py`). Sections with `coverage_status == "na"` are **excluded** from scoring (currently **1-1** only).


| section_key | Chapter     | Title                          | feature_count | penalty_crores |
| ----------- | ----------- | ------------------------------ | ------------- | -------------- |
| 1-2         | Preliminary | Definitions                    | 8             | 250            |
| 1-3         | Preliminary | Application                    | 2             | 250            |
| 2-4         | Ch. II      | Grounds for processing         | 3             | 200            |
| 2-5         | Ch. II      | Notice                         | 12            | 150            |
| 2-6         | Ch. II      | Consent                        | 18            | 150            |
| 2-7         | Ch. II      | Legitimate uses                | 4             | 150            |
| 2-8         | Ch. II      | General obligations            | 24            | 250            |
| 2-9         | Ch. II      | Children's data                | 8             | 200            |
| 2-10        | Ch. II      | Significant Data Fiduciary     | 11            | 250            |
| 3-11 … 3-15 | Ch. III     | Data Principal rights & duties | 4–8 each      | 50 each        |
| 4-16        | Ch. IV      | Processing outside India       | 6             | 250            |
| 4-17        | Ch. IV      | Exemptions                     | 3             | —              |
| 5-18        | Ch. V       | DPB constitution & powers      | 8             | —              |
| 6-27        | Ch. VI      | Appeals process                | 3             | —              |
| 7-32        | Ch. VII     | Penalty provisions             | 8 (catalog)   | 250            |
| 8-36        | Ch. VIII    | Miscellaneous                  | 4             | —              |


§6 (`2-6`) is the only section with persisted `dpdpa_feature_mappings` rows; all others use `DEFAULT_SECTION_FEATURES` at runtime.

---



## 10. Trend calculation (v1)

`get_score_trend()` does **not** read a `compliance_score_snapshots` table. It:

1. Computes current score from live data.
2. Samples `_compliance_score_at(org_id, as_of)` at ~4–12 points over the requested window.
3. Annotates points from audit log actions on that day, or generic “Score increased/decreased N pts” when the score changes between points.

Historical accuracy is limited until snapshot persistence is added.

---



## 11. Related documentation


| Document                                                                     | Relevance                                                                               |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [compliance_score.md](./compliance_score.md)                                 | UI spec, screen layout, QA matrix (Section 5 formulas there are superseded by this doc) |
| [dashboard.md](./dashboard.md)                                               | Dashboard KPIs surfacing compliance score                                               |
| [../Compliance/dpdpa_map.md](../Compliance/dpdpa_map.md)                     | DPDPA Map module, statute coverage, review workflow                                     |
| [../Compliance/security_safeguards.md](../Compliance/security_safeguards.md) | Security controls seeding and safeguards hub                                            |
| [../Compliance/audit_log.md](../Compliance/audit_log.md)                     | Audit log evidence chain                                                                |
| [../Governance/ropa_module.md](../Governance/ropa_module.md)                 | RoPA publishing and DPIA links (deduction source)                                       |
| `backend/docs/OVERVIEW_MODULE_IMPLEMENTATION.md`                             | Engineering overview of Overview module APIs                                            |


---



## 12. Implementation changelog notes

- **Not implemented:** Base Score − Risk Deductions (breach −15, DSAR SLA −5, missing DPO −10) described in older docs.
- **Implemented:** Penalty-weighted section average, five-route evidence, RoPA deductions, penalty exposure from section scores.
- **Future:** `compliance_score_snapshots` for accurate trend history; additional evidence routes for banner, RoPA, inventory, etc.

