# Overview Module Implementation

This document describes the Overview module APIs and how they feed the Dashboard, Compliance Score, and Automation Coverage pages.

## Pages and routes

| Page | Frontend route | Primary hooks |
|------|----------------|---------------|
| Dashboard | `/dashboard` | `useDashboard()` |
| Compliance Score | `/compliance/score` | `useComplianceScore()` |
| Automation Coverage | `/overview/automation` | `useAutomationCoverage()` |

All hooks use `useComplianceOrg()` for tenant scoping. Superadmins pass `?org_id=` from the session org picker.

## Dashboard APIs (`/api/dashboard/*`)

| Endpoint | Widget / consumer |
|----------|-------------------|
| `GET /dashboard/summary` | Hero gauge, metric cards, sidebar KPIs |
| `GET /dashboard/module-health` | Module Health grid |
| `GET /dashboard/activity-feed` | Recent Activity |
| `GET /dashboard/deadlines` | Upcoming Deadlines |
| `GET /dashboard/processing-trend` | Data Processing chart |
| `GET /dashboard/risk-heatmap` | Risk Heatmap |
| `GET /dashboard/onboarding-status` | Alert banner |

### Summary fields

- `compliance_score`, `compliance_status` — from `ComplianceMapService.get_summary`
- `metric_cards` — consent receipts, PII findings, open DSARs, active breaches
- `sidebar_kpis` — avg DSAR response, processor count (RoPA), withdrawal rate

## Compliance score APIs (`/api/compliance/score/*`)

| Endpoint | Purpose |
|----------|---------|
| `GET /compliance/score` | Overall score, status, penalties, days since incident |
| `GET /compliance/score/breakdown` | Per-statute-section rows with controls and gaps |
| `GET /compliance/score/trend` | v1 approximated trend from audit activity |
| `POST /compliance/score/recalculate` | Admin: refresh map review timestamp and recompute |

Scoring reuses the compliance map formula (documented controls + RoPA deductions). Breakdown derives control completion from `DpdpaFeatureMapping` evidence counts.

## Automation coverage (`/api/overview/automation-coverage`)

Returns donut stats and per-section `automation_status` (`fully`, `partial`, `manual`, `na`) from statute catalog + feature mappings.

## DPDPA mapping

Section keys align with `DpdpaStatuteSection` seed data (e.g. Section 6 consent, Section 8 obligations, Sections 11–13 rights). Configure routes map to frontend module paths via `PAGE_ROUTE_PATHS` in `dashboard_service.py`.

## Testing

```bash
cd backend
python -m app.scripts.test_dashboard_api
```

Requires a running API and valid `TEST_ADMIN_EMAIL` / `SUPERADMIN_PASSWORD` in `.env`.

## Deferred (v2)

- `compliance_score_snapshots` table for accurate historical trends
- GDPR readiness derived metric
- Signed auditor share links
