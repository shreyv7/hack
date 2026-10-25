# RBAC Touchpoint Map (pre-expansion audit)

Generated for RBAC expansion. Every file with role-dependent logic.

## Backend — core auth

| File | Mechanism |
|------|-----------|
| `backend/app/models/user.py` | `UserRole` enum, `users.role` column |
| `backend/app/core/dependencies.py` | `require_role()`, `get_current_user()` |
| `backend/app/core/rbac.py` | **NEW** central permission matrix |
| `backend/app/schemas/user.py` | Invite/update role validation |
| `backend/app/services/user_service.py` | list/invite/update, admin-only guards |
| `backend/app/routers/users.py` | `require_role(admin, superadmin)` on CRUD |
| `backend/app/services/auth_service.py` | Role in JWT / login |
| `backend/app/services/compliance_base.py` | `_require_admin()`, `_resolve_org_id()` |

## Backend — routers using `require_role` or `get_current_user`

| File | Notes |
|------|-------|
| `backend/app/routers/compliance.py` | Map review, safeguards, breach, audit |
| `backend/app/routers/dsar.py` | DSAR CRUD, portal public |
| `backend/app/routers/workspace.py` | Settings (admin) |
| `backend/app/routers/admin.py` | Superadmin org management |
| `backend/app/routers/consent.py` | Consent notices |
| `backend/app/routers/notice_delivery.py` | Campaign transitions |
| `backend/app/routers/ciso.py` | CISO module |
| `backend/app/routers/dpia.py` | DPIA |
| `backend/app/routers/data_inventory.py` | Data inventory |
| `backend/app/routers/retention.py` | Retention |
| `backend/app/routers/anonymisation.py` | Anonymisation |
| `backend/app/routers/masking.py` | Masking |
| `backend/app/routers/pii_scanner.py` | PII scanner |
| `backend/app/routers/integrations.py` | Integrations |
| `backend/app/routers/cross_border_transfer.py` | CBT |
| `backend/app/routers/proof_vault.py` | Proof vault |
| `backend/app/routers/tag_manager.py` | Tag manager |
| `backend/app/routers/consent_managers.py` | Consent managers |
| `backend/app/routers/childrens_data.py` | Children's data |
| `backend/app/routers/data_sources.py` | Data sources |
| `backend/app/routers/policy.py` | Policy manager |

## Backend — services with `_require_admin` or inline `UserRole`

| File | Notes |
|------|-------|
| `backend/app/services/dsar_service.py` | Assign, grievance, admin/user scoping |
| `backend/app/services/breach_disclosure_service.py` | All breach mutations |
| `backend/app/services/notice_delivery_service.py` | Campaign `legal_review` / `dpo_approval` |
| `backend/app/services/consent_service.py` | Notice CRUD |
| `backend/app/services/workspace_service.py` | Org settings |
| `backend/app/services/audit_log_service.py` | Audit read/write |
| `backend/app/services/compliance_map_service.py` | Map review |
| `backend/app/services/security_safeguards_service.py` | Safeguards update |
| `backend/app/services/data_inventory_service.py` | Inventory mutations |
| `backend/app/services/retention_service.py` | Retention |
| `backend/app/services/anonymisation_service.py` | Anonymisation |
| `backend/app/services/masking_service.py` | Masking |
| `backend/app/services/pii_scan_service.py` | PII scan |
| `backend/app/services/child_data_service.py` | Child data |
| `backend/app/services/ciso_service.py` | CISO assets |
| `backend/app/services/organization_service.py` | Org admin |
| `backend/app/services/policy_service.py` | Policies |
| `backend/app/services/banner_service.py` | Banners |
| `backend/app/services/tag_manager_service.py` | Tags |
| `backend/app/services/governance_*` | Governance dashboards |

## Backend — workflow / assignment

| File | Notes |
|------|-------|
| `backend/app/models/dsar.py` | `assigned_to_user_id`, grievance types |
| `backend/app/models/compliance.py` | `BreachIncident` (add assign/escalate) |
| `backend/app/models/user_scope_assignment.py` | **NEW** data steward scope |
| `backend/app/services/notice_delivery_service.py` | Approval chain statuses |

## Frontend

| File | Notes |
|------|-------|
| `frontend/src/types/auth.ts` | `UserRole` type |
| `frontend/src/lib/auth/permissions.ts` | `canEdit`, `canManageUsers`, etc. |
| `frontend/src/lib/auth/display.ts` | Role labels |
| `frontend/src/app/components/pages/TeamManagement.tsx` | Role dropdown |
| `frontend/src/hooks/useDsarSlaManagement.ts` | Assignee picker |
| `frontend/src/app/components/pages/DSARSLATracker.tsx` | DSAR actions |
| `frontend/src/app/components/pages/BreachIncidentsList.tsx` | Breach actions |
| `frontend/src/app/components/pages/BreachDisclosureWizard.tsx` | Breach wizard |
| `frontend/src/app/components/pages/ConsentNoticesManager.tsx` | Consent approval |
| `frontend/src/app/components/shell/Sidebar.tsx` | Nav visibility |
| `frontend/src/router/pathMap.ts` | Route role hints |
| `frontend/src/lib/api/users.ts` | Users API client |

## Database

| Artifact | Notes |
|----------|-------|
| `user_role` PostgreSQL enum | Extend with 8 new values |
| `users.role` | Single role per user |
| `breach_incidents` | Add `assigned_to_user_id`, `escalated_to_user_id`, `escalated_at` |
| `data_rights_requests` | Add `requires_legal_signoff`, `legal_signed_off_by_user_id` |
| `user_scope_assignments` | **NEW** steward scoping |

## Seeds / scripts

| File | Notes |
|------|-------|
| `backend/app/scripts/seed_entire_db.py` | Sandbox org + superadmin |
| `backend/app/scripts/create_test_user.py` | Test users |
| `backend/app/scripts/create_superadmin.py` | Superadmin bootstrap |
