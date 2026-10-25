# Dead Code Audit — 2026-07-27

Automated and manual audit of `dpdpa_shield/` after removing duplicate legacy `app/`, `src/`, and `alembic/` trees.

## Phase 0 — Outer repo cleanup (completed)

- Committed removal of stale tracked paths: `backend/`, `frontend/`, `DPDPA/` (~886 files)
- Restored root `.gitignore` and workspace `README.md`
- Removed `.cursor/debug-*.log` artifacts
- `dpdpa_shield/` is the active application (nested git repo, ignored by outer repo)

## Phase 1 — Duplicate legacy trees (completed)

Removed from `dpdpa_shield/`:

| Path | Reason |
|------|--------|
| `app/` | Stale subset duplicate of `backend/app/` |
| `src/` | Stale subset duplicate of `frontend/src/` |
| `alembic/` | Orphaned migration versions (no `env.py`; real alembic is `backend/alembic/`) |

## Phase 2 — Tooling results

### Frontend — knip

- **88 unused files** (includes shadcn UI boilerplate, design showcase, disabled prototypes)
- **43 unused dependencies** (many are transitive shadcn/Radix peers — do not bulk-remove without testing)
- **91 unused exports**

Key confirmed-dead files (zero external importers):

```
src/app/App.tsx
src/app/components/sections/*
src/app/components/pages/DataRightsPortal.tsx
src/app/components/pages/DPDPAConsentManagers.tsx
src/app/components/pages/MonitoringScheduling.tsx
src/app/components/pages/WelcomeSetup.tsx
src/app/components/pages/DiagramComplianceScore.tsx
src/app/components/pages/DiagramConsentFlow.tsx
src/app/components/pages/DiagramPIIFlow.tsx
src/app/components/pages/EmptyStateDataSources.tsx
src/app/components/pages/EmptyStateNotices.tsx
src/lib/api/consentManagers.ts
src/lib/api/orgHierarchy.ts
```

### Frontend — depcheck (conservative)

Unused deps flagged: `@emotion/react`, `@emotion/styled`, `@mui/*`, `@popperjs/core`, `canvas-confetti`, `motion`, `react-popper`, `react-responsive-masonry`, `react-slick`, `tw-animate-css`

**Action:** Deferred — verify before removing (may be used by unreferenced components or build pipeline).

### Backend — vulture (min-confidence 80)

24 unused imports across routers, services, and seed scripts. Safe to remove individually.

### Backend — deptry

42 issues — mostly false positives for optional connector deps (`boto3`, `azure-*`, `google-*`) imported inside functions. Do not remove from `requirements.txt` without product review.

## Phase 3 — Links, routes, endpoints

### Docs links

- Scanned 31 relative markdown links across repo
- **0 broken relative links**

### Orphaned page components (no router registration)

16 page files are helper/modal components living under `pages/` but not route targets — most are imported by active pages (e.g. `BannerInstallDocModal`, `CreateBannerWizard`). Only the prototype/disabled pages listed above are safe to delete.

### Disabled routes (commented in router)

| Page | Route | Status |
|------|-------|--------|
| `MonitoringScheduling` | `/security/monitoring` | Prototype — route commented |
| `DPDPAConsentManagers` | `/integrations/consent-managers` | Hidden — route commented |

### Backend endpoints with no frontend API reference (heuristic)

13 of 516 endpoints — expected for webhooks, public CMP script, admin tools:

| Router | Endpoint | Likely reason |
|--------|----------|---------------|
| `integrations_public.py` | `GET /public/v1/integrations/cmp.js` | Served to external sites |
| `notice_delivery.py` | Twilio/Shiprocket webhooks | External callbacks |
| `vajra_ai.py` | `POST /ai/admin/reindex-docs` | Admin/maintenance |
| `users.py` | notifications, scopes | Partial frontend coverage |
| `proof_vault.py` | lookup | May use dynamic paths |

**Action:** Do not delete — document as intentional external/admin endpoints.

## Phase 4 — Removal batches

See git commits:

1. `chore: remove disabled prototype pages and unused components`
2. `chore: remove unused Python imports flagged by vulture`

## Phase 5 — Guardrails

- Added `knip.json` with proper entry points
- Added `dead-code:*` scripts to root `package.json`
- Documented repo structure in root and `dpdpa_shield/README.md`

## Deferred / manual review

| Item | Notes |
|------|-------|
| `dpdpa_shield/New Note.md`, `slides.md`, `cis.xlsx` | Personal working files — not deleted |
| 60+ unused shadcn `ui/*` components | Boilerplate — keep until UI consolidation |
| Unused npm dependencies | Run `pnpm dead-code:frontend` before each release |
| Optional Python connector deps | Required for enterprise data-source integrations |
