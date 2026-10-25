# RBAC Expansion — Implementation Report

**Project:** DPDPA Shield / ZeroShield  
**Date:** 6 July 2026  
**Status:** Implemented and migrated on local dev database

---

## Executive summary

The platform role system was expanded from three login roles (`superadmin`, `admin`, `user`) to eleven, adding eight DPDPA-specific roles with **enforced permissions and workflow routing** — not display-only labels. A central RBAC layer (`Permission` enum + `ROLE_PERMISSIONS` matrix) now drives backend authorization, assignee pickers, and module workflows for DSAR, breach management, consent notices, compliance, and data inventory.

Legacy roles (`superadmin`, `admin`, `user`) were **kept unchanged**; new roles are additional assignable roles per product decision.

---

## Objective

Support statutory and operational DPDPA roles with real enforcement:

| Role | Intent |
|------|--------|
| CISO | Breach escalations, incident closure, security policy override |
| Legal Head | Final legal sign-off (DSAR, consent / DPO approval chain) |
| Legal Counsel | Draft and review legal responses (no final sign-off) |
| Compliance Officer | Compliance dashboard, audit writes, cross-module task assignment |
| Grievance Redressal Officer | Default grievance assignee, SLA ownership |
| Security Analyst | Breach triage and logging (cannot close) |
| Data Steward | Department/asset-scoped data processing approvals |
| Auditor | Read-only across all modules |

---

## Before vs after

| Area | Before | After |
|------|--------|-------|
| PostgreSQL `user_role` enum | `superadmin`, `admin`, `user` | + 8 DPDPA roles |
| Authorization | Scattered `require_role()` / `_require_admin()` / inline checks | Central [`backend/app/core/rbac.py`](../../backend/app/core/rbac.py) |
| DPO | Workspace contact field + notice status `dpo_approval` only | Legal Head role holders enforce `dpo_approval` transitions |
| DSAR assignees | All org users in pickers | Role-filtered lists; grievance auto-assign on OTP verify |
| Breach workflow | No assignee / escalation fields | `assigned_to_user_id`, `escalated_to_user_id`, assign/escalate/close APIs |
| Data Steward | No scoping | `user_scope_assignments` join table |
| Auditor | N/A | Server-side read-only (non-GET blocked) + UI `canEdit` false |
| Team UI | Admin / User dropdown only | Full role catalog from `GET /users/roles` with permission summary |

---

## Architecture

```
UserRole (PostgreSQL enum)
        │
        ▼
ROLE_PERMISSIONS matrix  ◄───  Permission enum
        │
        ├── has_permission() / require_permission()
        ├── get_current_user() → auditor write block
        └── list_users_by_role() / default_assignee_for_role()
                │
                ├── DSAR grievance → grievance_officer
                ├── Breach create → security_analyst
                ├── Breach escalate → ciso
                ├── Notice legal_review → legal_counsel / legal_head
                └── Notice dpo_approval → legal_head
```

**Single source of truth (backend):** [`backend/app/core/rbac.py`](../../backend/app/core/rbac.py)  
**Frontend mirror:** [`frontend/src/lib/auth/permissions.ts`](../../frontend/src/lib/auth/permissions.ts)

---

## Database changes

**Migration:** [`backend/alembic/versions/20260707_expand_rbac.py`](../../backend/alembic/versions/20260707_expand_rbac.py)  
**Revision ID:** `20260707_expand_rbac`  
**Parent:** `20260706_anon_dl_log`

### Enum extension

```sql
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ciso';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'legal_head';
-- legal_counsel, compliance_officer, grievance_officer,
-- security_analyst, data_steward, auditor
```

### New table: `user_scope_assignments`

| Column | Purpose |
|--------|---------|
| `user_id` | Data Steward user |
| `organization_id` | Tenant boundary |
| `business_unit_id` | Optional scope |
| `department_id` | Optional scope |

### `breach_incidents` additions

- `assigned_to_user_id`
- `escalated_to_user_id`
- `escalated_at`

### `data_rights_requests` additions

- `requires_legal_signoff` (boolean)
- `legal_signed_off_by_user_id`

---

## Backend API changes

### Users

| Endpoint | Description |
|----------|-------------|
| `GET /api/users/roles` | Role catalog with labels, descriptions, permission list |
| `GET /api/users?role={role}` | Role-filtered user list for assignee pickers |
| `GET/POST/DELETE /api/users/{id}/scopes` | Data Steward scope assignments |
| Invite / PATCH | Accept all invitable roles (not `superadmin`) |

### DSAR

| Endpoint / behavior | Permission / routing |
|---------------------|-------------------|
| Grievance OTP verified | Auto-assign first active `grievance_officer` |
| `PATCH /dsar/requests/{id}` with `requires_legal_signoff` | `DSAR_LEGAL_DRAFT` |
| `POST /dsar/requests/{id}/legal-signoff` | `DSAR_LEGAL_SIGNOFF` (Legal Head) |
| Resolve with legal flag set | Blocks until sign-off or Legal Head resolves |

### Breach (compliance router)

| Endpoint | Permission |
|----------|------------|
| `POST /compliance/breaches/{id}/assign` | `BREACH_TRIAGE` |
| `POST /compliance/breaches/{id}/escalate` | `BREACH_TRIAGE` → routes to CISO |
| `POST /compliance/breaches/{id}/close` | `BREACH_CLOSE` |

### Consent / notice delivery

- Transition to `legal_review` requires `CONSENT_REVIEW`
- Transition to `dpo_approval` requires `CONSENT_APPROVE` (Legal Head)
- DB status name `dpo_approval` retained for backward compatibility

### Auditor enforcement

In [`backend/app/core/dependencies.py`](../../backend/app/core/dependencies.py), `get_current_user` rejects `POST`, `PATCH`, `PUT`, `DELETE` for `auditor` role (auth self-service endpoints exempt).

---

## Frontend changes

| Area | Files | Change |
|------|-------|--------|
| Types | `frontend/src/types/auth.ts` | All role literals + `Permission` type |
| Permissions | `frontend/src/lib/auth/permissions.ts` | Full matrix, `hasPermission()`, role helpers |
| Labels | `frontend/src/lib/auth/display.ts` | Human-readable role names |
| Team management | `TeamManagement.tsx` | Dynamic role dropdown + permission summary |
| DSAR SLA | `useDsarSlaManagement.ts`, `DSARSLATracker.tsx` | Role-filtered assignees; Forward to Legal / Legal sign-off |
| Breach list | `BreachIncidentsList.tsx` | Escalate to CISO / Close (permission-gated) |
| Hooks | `useComplianceOrg`, `useWorkspaceSettings`, `useConsentManagement`, etc. | `canEdit` respects auditor + role permissions |

---

## Files created or materially changed

### New files

- `backend/app/core/rbac.py`
- `backend/app/models/user_scope_assignment.py`
- `backend/alembic/versions/20260707_expand_rbac.py`
- `backend/app/scripts/seed_rbac_users.py`
- `docs/internal/rbac_touchpoint_map.md`
- `docs/Overview/rbac_permission_matrix.md`
- `docs/Overview/rbac_expansion_implementation_report.md` (this document)

### Key modified backend files

- `backend/app/models/user.py`, `backend/app/schemas/user.py`
- `backend/app/core/dependencies.py`, `backend/app/services/compliance_base.py`
- `backend/app/routers/users.py`, `backend/app/services/user_service.py`
- `backend/app/services/dsar_service.py`, `backend/app/routers/dsar.py`
- `backend/app/services/breach_disclosure_service.py`, `backend/app/routers/compliance.py`
- `backend/app/services/notice_delivery_service.py`
- `backend/app/services/security_safeguards_service.py`, `data_inventory_service.py`
- `backend/app/services/compliance_map_service.py`

### Key modified frontend files

- `frontend/src/types/auth.ts`, `user-management.ts`
- `frontend/src/lib/auth/permissions.ts`, `display.ts`, `api/users.ts`
- `frontend/src/hooks/useDsarSlaManagement.ts`
- `frontend/src/app/components/pages/TeamManagement.tsx`, `DSARSLATracker.tsx`, `BreachIncidentsList.tsx`

Full pre-expansion touchpoint audit: [`docs/internal/rbac_touchpoint_map.md`](../internal/rbac_touchpoint_map.md)

---

## Local setup performed

```bash
cd backend
pip install -r requirements.txt
python -m alembic stamp 0d015ef4002d   # resolved duplicate alembic_version rows
python -m alembic upgrade head         # applied through 20260707_expand_rbac
python -m app.scripts.seed_entire_db
python -m app.scripts.seed_rbac_users
```

**Migration head after setup:** `20260707_expand_rbac`

### Alembic fixes applied during setup

Two merge revisions incorrectly listed both parent and child as parallel heads (linear chain was already defined):

- [`backend/alembic/versions/0d015ef4002d_merge_heads.py`](../../backend/alembic/versions/0d015ef4002d_merge_heads.py) — parent set to `20260701_consent_portal_email` only
- [`backend/alembic/versions/d82f74ba2e2e_merge_heads.py`](../../backend/alembic/versions/d82f74ba2e2e_merge_heads.py) — parent set to `20260703_consent_portal_sms` only

Database had duplicate rows in `alembic_version`; resolved via `alembic stamp 0d015ef4002d`.

---

## Dev seed users

**Script:** `python -m app.scripts.seed_rbac_users`  
**Organization:** `zeroshield-sandbox-org`  
**Password (all demo users):** `RoleDemo@12345`

| Role | Email |
|------|-------|
| CISO | `ciso@zeroshield.in` |
| Legal Head | `legal.head@zeroshield.in` |
| Legal Counsel | `legal.counsel@zeroshield.in` |
| Compliance Officer | `compliance@zeroshield.in` |
| Grievance Redressal Officer | `grievance@zeroshield.in` |
| Security Analyst | `security@zeroshield.in` |
| Data Steward | `steward@zeroshield.in` |
| Auditor | `auditor@zeroshield.in` |

---

## Verification traces

| Flow | Expected behavior |
|------|-------------------|
| Grievance portal submit → OTP verify | Request auto-assigned to `grievance_officer` |
| Create breach incident | Assigned to first `security_analyst` |
| Escalate breach | `escalated_to_user_id` set to CISO |
| Close breach | Only CISO / admin (`BREACH_CLOSE`) |
| DSAR → Forward to Legal → Legal sign-off → Resolve | `requires_legal_signoff` + `legal_signed_off_by_user_id` enforced |
| Auditor `POST` any API | `403 Auditor role is read-only` |
| Team Management | All 8 new roles invitable with permission summary |

Frontend TypeScript check (`npx tsc --noEmit`) passed after implementation.

---

## Known limitations and follow-ups

1. **DPO naming:** Notice workflow DB status remains `dpo_approval`; enforcement maps to `legal_head` role. Workspace `dpo_email` still used for breach DPB notification email fallback.

2. **Partial enforcement migration:** Priority modules use `require_permission()`; some legacy services still call `_require_admin()` shim on `ComplianceBaseService`. Further grep-driven migration can continue using the touchpoint map.

3. **Data Steward UI:** Scope picker on Team Management is API-ready (`/users/{id}/scopes`); full business-unit/department picker UI may need RoPA hierarchy integration.

4. **Master seed:** `seed_entire_db` CISO module step logged `name 'UUID' is not defined` — non-blocking for RBAC seeds; fix separately in CISO seed script.

5. **Admin vs Compliance Officer overlap:** Both can manage compliance dashboard; only `admin` retains `USER_MANAGE` and workspace settings by design.

---

## Related documentation

- [RBAC permission matrix](./rbac_permission_matrix.md) — module × role matrix and workflow routing
- [RBAC touchpoint map](../internal/rbac_touchpoint_map.md) — pre-expansion file audit
- [Auth design (backend)](../../backend/docs/AUTH_DESIGN.md) — original auth architecture
- [DPDP role mapping (settings)](../Settings/dpdp_role_mapping.md) — workspace statutory role labels (separate from login RBAC)

---

## Permission matrix (summary)

See [rbac_permission_matrix.md](./rbac_permission_matrix.md) for the full table. Core principle:

- **Auditor:** all `*_READ` permissions only; zero write
- **Security Analyst:** breach triage/log; no close
- **CISO:** breach close, escalation receive, security policy override
- **Legal Counsel:** draft/review; no final sign-off
- **Legal Head:** DSAR legal sign-off, consent approve, grievance escalated approve
- **Grievance Officer:** grievance manage, DSAR assign for grievance-type requests
- **Compliance Officer:** compliance manage, audit write, task assign
- **Data Steward:** scoped `DATA_ASSET_APPROVE_SCOPED` via `user_scope_assignments`
- **Admin / superadmin:** broad superset (legacy behavior preserved)
