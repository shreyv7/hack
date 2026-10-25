# Authentication & Multi-Tenancy — Module Summary

> **Scope:** Login, roles, tenant isolation, and platform administration  
> **Related design spec:** [AUTH_DESIGN.md](./AUTH_DESIGN.md)

---

## What this module does in the portal

This is the **front door and tenancy layer** for DPDPA Shield. Every customer organization gets its own isolated workspace. Users sign in once and only see data belonging to their organization (unless they are a platform superadmin).

The module answers three business questions:

1. **Who can access the portal?** — authenticated users with approved accounts  
2. **What can they do?** — determined by role (superadmin, org admin, org user)  
3. **Whose data do they see?** — always scoped to one organization, except superadmin

---

## User roles at a glance

| Role | Who | Main capability |
|------|-----|-----------------|
| **Superadmin** | Platform operator (us) | Manage all organizations, approve signups, cross-tenant visibility |
| **Admin** | Customer org administrator | Full product access + invite/manage users in **own org only** |
| **User** | Customer team member | Full product access; **cannot** manage people |

**Important:** Admin and User have the **same product permissions** for consent, compliance, DSAR, etc. The only difference is people management.

---

## Authentication flows

### Login
- **Input:** Email + password  
- **Output:** Access token + refresh token; flag if password change is required  
- **Flow:** User logs in → backend validates credentials → JWT issued → frontend stores session → protected pages load

### Self-service signup
- **Input:** Company name, full name, email, password  
- **Output:** New organization (pending) + admin user (pending approval)  
- **Flow:** User can log in immediately but sees a **“awaiting approval”** screen until a superadmin activates the org

### Invite (admin → team member)
- **Input:** Email, name, role (admin or user)  
- **Output:** New user with temporary password (sent by email)  
- **Flow:** Invitee logs in with temp password → forced to set a new password → full access

### Password change
- Required after invite; optional anytime from profile  
- Until changed, user is blocked from product pages (self-service auth routes still work)

---

## Multi-tenancy model

```
Platform (Superadmin)
 └── Organization A          └── Organization B
      ├── Admin(s)                ├── Admin(s)
      └── User(s)                 └── User(s)
```

- Each **organization** is a tenant with a unique name and URL slug  
- All consent notices, purposes, compliance records, DSAR requests, and settings are **tagged with `organization_id`**  
- API queries automatically filter by the logged-in user’s org  
- **Superadmin** selects an org context when working across tenants (org picker on relevant pages)

**Tenant isolation rule:** An org admin or user can never read or write another organization’s data.

---

## Administration module

Visible in the sidebar under **Administration** (superadmin and/or org admin only).

| Page | Who sees it | What it does |
|------|-------------|--------------|
| **Organizations** | Superadmin | Create, edit, suspend, delete customer tenants; provision first org admin |
| **Pending Approvals** | Superadmin | Review self-service signups; approve or reject new organizations |
| **Team & Users** | Admin + Superadmin | Invite users, change roles, disable/delete accounts, resend invites |

### Administration data flow

```
Superadmin creates org
  → Organization row + default settings + first admin (invited)
  → Invite email sent
  → Admin sets password → org is live

Self-service signup
  → Org (pending) + Admin (pending_approval)
  → Superadmin approves in Pending Approvals
  → Org becomes active → customer can use full portal

Org Admin invites colleague
  → User row (invited) + temp password email
  → Colleague completes onboarding → active user in same org
```

---

## Inputs and outputs (summary)

| Action | Input | Stored / returned |
|--------|-------|-------------------|
| Login | Email, password | JWT tokens, user profile, `must_change_password` flag |
| Signup | Company, name, email, password | Organization, admin user, default workspace settings |
| Invite user | Email, name, role | User record, email notification |
| Approve signup | User/org ID | Org status → active; user status → active |
| Every API call | Bearer token | Scoped data for that user’s organization |

---

## How other modules depend on this

- **Workspace Settings** — requires org membership; writes limited to admin  
- **Consent Management** — all notices/purposes scoped to org  
- **Compliance** — audit log, breach records, safeguards per org  
- **DSAR / Rights Portal** — public portal URL uses org slug; tracker data is org-isolated  

Without auth + tenancy, none of the above modules can safely share one deployment.

---

## Weekly update talking points

- Three-role model (superadmin / admin / user) with strict org isolation is **implemented and enforced on every API route**  
- Self-service signup with **superadmin approval gate** prevents unauthorized tenants  
- Invite flow with **temporary password + forced reset** is live  
- Administration UI covers **org lifecycle**, **signup approvals**, and **team management**  
- JWT carries role and org context for fast, consistent access control across the portal  

---

## Key implementation references

| Area | Location |
|------|----------|
| Auth API | `backend/app/routers/auth.py`, `backend/app/services/auth_service.py` |
| Admin API | `backend/app/routers/admin.py`, `backend/app/services/organization_service.py` |
| Users API | `backend/app/routers/users.py`, `backend/app/services/user_service.py` |
| Request guards | `backend/app/core/dependencies.py` |
| Frontend auth | `frontend/src/contexts/AuthContext.tsx` |
| Admin pages | `OrganizationManagement`, `PendingApprovals`, `TeamManagement` |
