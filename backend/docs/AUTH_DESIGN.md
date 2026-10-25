# 🔐 DPDPA Shield — Authentication & User Management (Design Spec)

## 1. Goal in one paragraph

We need a login system with **three roles**. A **Superadmin** (us — the product
owner) sits above everything and manages all organizations and all their users.
Each customer is an **Organization**. Inside an organization there are two kinds
of accounts: **Admin** and **User**. Admin and User are *identical* in what they
can do with the product — the **only** difference is that an Admin can manage the
people in their own organization (invite, edit, delete) and a User cannot.
Inviting someone is kept simple: the system emails them a **temporary password**;
they log in with it and are forced to set a new one.

---

## 2. Roles & the permission matrix

| Capability | Superadmin | Admin (org-scoped) | User (org-scoped) |
|---|:---:|:---:|:---:|
| Log in / change own password | ✅ | ✅ | ✅ |
| Use all product features | ✅ | ✅ | ✅ |
| **Invite / add users** | ✅ (any org) | ✅ (own org only) | ❌ |
| **Edit a user's role (Admin↔User)** | ✅ (any org) | ✅ (own org only) | ❌ |
| **Enable / disable / delete users** | ✅ (any org) | ✅ (own org only) | ❌ |
| **Create / suspend / delete organizations** | ✅ | ❌ | ❌ |
| Create the *first* admin of a new org | ✅ | ❌ | ❌ |
| See data across **all** organizations | ✅ | ❌ | ❌ |

**Key rules**
- An **Admin can never create a Superadmin** and can never touch another
  organization. (Prevents privilege escalation.)
- A **Superadmin has no organization** — they are global. Admins and Users
  always belong to exactly one organization.
- **Tenant isolation:** every Admin/User query is automatically filtered to
  their own `organization_id`. Only Superadmin bypasses that filter.

---

## 3. Data model (two new tables)

```
┌─────────────────────────────┐         ┌──────────────────────────────────────┐
│       organizations         │ 1     * │                users                 │
│─────────────────────────────│────────<│──────────────────────────────────────│
│ id            UUID  (PK)     │         │ id                  UUID  (PK)        │
│ name          str            │         │ organization_id     UUID  (FK, NULL  │
│ slug          str  (unique)  │         │                     for superadmin)  │
│ status        enum           │         │ email               str   (unique)   │
│   active | suspended         │         │ password_hash       str              │
│ created_at    datetime       │         │ full_name           str              │
│ updated_at    datetime       │         │ role                enum             │
└─────────────────────────────┘         │   superadmin|admin|user              │
                                         │ status              enum             │
                                         │   invited|active|disabled            │
                                         │ must_change_password bool (default T)│
                                         │ last_login_at       datetime (NULL)  │
                                         │ created_at          datetime         │
                                         │ updated_at          datetime         │
                                         └──────────────────────────────────────┘
```

Notes:
- Both tables inherit the existing `BaseModel` (UUID `id` + timestamps) from
  `app/models/base.py`.
- `role` and `status` should be Python `enum.Enum` classes used as SQLAlchemy
  `Enum` columns — not free-text strings.
- `organization_id` is **nullable** *only* because Superadmins have no org. For
  Admin/User it is always required (enforce in the service layer).
- `must_change_password` defaults to **True** for every invited user; it flips to
  False after they set their own password. We do **not** need a separate
  invitations table for the MVP — the temp-password approach lets us reuse the
  `users` row with `status = invited`.

---

## 4. How authentication works (the moving parts)

Everything below builds on helpers that **already exist** in the scaffold:
- `app/core/security.py` → `hash_password`, `verify_password`,
  `create_access_token`, `create_refresh_token`, `decode_token`.
- `app/core/dependencies.py` → where `get_current_user` and `require_role` will live.

**Token contents (JWT):** when a user logs in we issue a short-lived **access
token** and a longer-lived **refresh token**. The access token payload carries:

```json
{ "sub": "<user_id>", "role": "admin", "org_id": "<organization_id>", "exp": ... }
```

`role` and `org_id` are included so we can scope requests quickly. For sensitive
actions (delete user, change role) the service should still re-load the user from
the DB and re-check — never trust the token alone for write operations.

**On every protected request:**

```
Request with  Authorization: Bearer <access_token>
        │
        ▼
get_current_user (dependency)
   1. decode + verify JWT  ── invalid/expired ─► 401 Unauthorized
   2. load user from DB    ── not found/disabled ─► 401 / 403
   3. if must_change_password == True AND route not self-service ─► 403 (force reset)
   4. if status == pending_approval AND route not self-service ─► 403 (await approval)
      (self-service routes always allowed: /auth/me, /auth/logout, /auth/change-password)
        │
        ▼
require_role("admin")  (optional extra guard on admin-only routes)
   role not allowed ─► 403 Forbidden
        │
        ▼
Route handler runs, scoped to current_user.organization_id
```

---

## 5. Flow diagrams

### 5.1 Login + forced first-password change

```
┌────────┐      POST /api/auth/login {email, password}      ┌─────────┐
│ Client │ ───────────────────────────────────────────────►│ Backend │
└────────┘                                                  └─────────┘
                                                                 │
                                  verify_password(pw, hash)      │
                                                                 ▼
                                              ┌──────────────────────────────┐
                                              │ wrong / disabled? → 401/403   │
                                              └──────────────────────────────┘
                                                                 │ ok
                                                                 ▼
                              issue access + refresh tokens; return
                              { tokens, must_change_password: true|false }
                                                                 │
        ┌────────────────────────────────────────────────────────┘
        ▼
 must_change_password == true?
        │ yes                                  │ no
        ▼                                      ▼
 Client shows "Set new password" screen   Normal app access
        │
        ▼
 POST /api/auth/change-password {old (temp), new}
        │
        ▼
 Backend: verify temp, hash(new), set must_change_password=false,
          status=active  → 200. User continues normally.
```

### 5.2 Admin invites a user (within their organization)

```
┌────────────┐  POST /api/users/invite {email, full_name, role}  ┌─────────┐
│ Admin (UI) │ ─────────────────────────────────────────────────►│ Backend │
└────────────┘                                                    └─────────┘
                                                                       │
   require_role(admin|superadmin)                                      │
   force org = current_user.organization_id (admin cannot pick another)│
   reject role == superadmin                                           │
                                                                       ▼
                          generate temp password (random, e.g. 12 chars)
                          create user: status=invited,
                                       must_change_password=true,
                                       password_hash = hash(temp)
                                                                       │
                                                                       ▼
                          EmailService.send_invite(email, temp_password)
                          (real email via Gmail SMTP using app password from .env)
                                                                       │
                                                                       ▼
                          201 Created { user }   (NEVER return the temp pw in API)
                                                                       │
   ┌───────────────────────────────────────────────────────────────────┘
   ▼
New user receives email → logs in with temp pw → forced change (flow 5.1)
```

### 5.3 Superadmin creates an organization + its first Admin

```
┌─────────────┐  POST /api/admin/organizations                       ┌─────────┐
│ Superadmin  │  { org_name, slug, admin_email, admin_full_name }    │ Backend │
└─────────────┘ ────────────────────────────────────────────────────►└─────────┘
                                                                          │
  require_role(superadmin)                                                │
                                                                          ▼
            create organization (status=active)
            generate temp password for the admin
            create user: role=admin, organization_id=<new org>,
                         status=invited, must_change_password=true
            EmailService.send_invite(admin_email, temp_password)
                                                                          │
                                                                          ▼
            201 Created { organization, admin_user }
```

### 5.4 Bootstrapping the very first Superadmin (chicken-and-egg)

There is no Superadmin to create the first Superadmin, so it cannot come through
the API. It is created by a **one-time seed script** run from the terminal, which
reads credentials from environment variables.

```
SUPERADMIN_EMAIL + SUPERADMIN_PASSWORD in .env
        │
        ▼
python -m app.scripts.create_superadmin
        │
        ▼
inserts one user: role=superadmin, organization_id=NULL,
                  must_change_password=true (so we change it on first login)
(idempotent: if a superadmin already exists, do nothing)
```

### 5.5 Self-service signup + superadmin approval (IMPLEMENTED)

Anyone can register their company. They can log in immediately but are **gated out
of the app** until a superadmin approves them. Two new statuses support this:
`OrganizationStatus.pending` and `UserStatus.pending_approval`.

```
┌────────┐  POST /api/auth/signup  (public, no auth)            ┌─────────┐
│ Public │  { company_name, full_name, email, password }        │ Backend │
└────────┘ ───────────────────────────────────────────────────►└─────────┘
                                                                     │
   reject duplicate email (409)                                      │
   slugify(company_name) -> unique slug                              │
                                                                     ▼
        create Organization(status = pending)
        create User(role = admin, status = pending_approval,
                    must_change_password = false)   # they chose their own pw
                                                                     │
                                                                     ▼
        201 Created { user }
                                                                     │
   ┌──────────────────────────────────────────────────────────────────┘
   ▼
User logs in -> gets a token, but every app route returns
   403 "Account pending superadmin approval"
   (only /auth/me, /auth/logout, /auth/change-password work)
   ▼
Superadmin: GET /api/admin/signups           -> sees the pending user
            POST /api/admin/signups/{id}/approve
                 -> User.active + Organization.active
            (or .../reject -> deletes the pending org + user)
   ▼
User logs in again -> full access; can now invite their own org users.
```

---

## 6. API surface (endpoints to build)

> Prefix everything with `settings.API_V1_PREFIX` (i.e. `/api`). Group into three
> routers: `auth.py`, `users.py`, `admin.py`.

### Auth — `app/routers/auth.py` (any logged-in user)
| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | `/auth/signup` | public | self-register: creates pending org + pending admin (flow 5.5) |
| POST | `/auth/login` | public | email+password → access+refresh tokens + `must_change_password` |
| POST | `/auth/refresh` | public (valid refresh token) | new access token |
| GET  | `/auth/me` | any | current user's profile + role + org |
| POST | `/auth/change-password` | any | set new password (used for first login + later changes) |
| POST | `/auth/logout` | any | optional; client just discards tokens (or server-side blacklist later) |

### Org user management — `app/routers/users.py` (Admin + Superadmin)
| Method | Path | Who | Purpose |
|---|---|---|---|
| GET    | `/users` | admin | list users **in caller's org** |
| POST   | `/users/invite` | admin | create user + temp pw + email (flow 5.2) |
| PATCH  | `/users/{id}` | admin | change role (admin↔user), enable/disable, edit name |
| DELETE | `/users/{id}` | admin | remove user |
| POST   | `/users/{id}/resend-invite` | admin | regenerate temp pw + re-email |

### Platform admin — `app/routers/admin.py` (Superadmin only)
| Method | Path | Purpose |
|---|---|---|
| GET    | `/admin/organizations` | list all organizations |
| POST   | `/admin/organizations` | create org + first admin (flow 5.3) |
| PATCH  | `/admin/organizations/{id}` | rename / suspend / reactivate |
| DELETE | `/admin/organizations/{id}` | delete org (and its users) |
| GET    | `/admin/users` | list users across **all** orgs (filterable by org) |
| GET    | `/admin/signups` | list pending self-service signups (flow 5.5) |
| POST   | `/admin/signups/{id}/approve` | activate the user + their org |
| POST   | `/admin/signups/{id}/reject` | delete the pending org + user |

> Superadmin can also call any `/users/...` endpoint for any org (pass/override
> the target org). Implement this by letting the service skip the org filter when
> `current_user.role == superadmin`.

---

## 7. Security rules the must enforce (checklist)

- [ ] **Never store plaintext passwords.** Temp passwords are hashed too
      (`hash_password`). The plaintext temp pw exists only in the email send call.
- [ ] **Never return passwords or `password_hash` in any API response.** Use a
      response schema (`UserRead`) that omits them.
- [ ] **Generate temp passwords with `secrets`** (e.g. `secrets.token_urlsafe(9)`),
      not `random`.
- [ ] **Force password change:** while `must_change_password` is True, block every
      endpoint except `/auth/change-password` (do this inside `get_current_user`).
- [ ] **Tenant isolation:** Admin/User queries always filter by
      `current_user.organization_id`. Add it to every list/get/update/delete.
- [ ] **Privilege rules:** Admin cannot create/assign `superadmin`; cannot act on
      another org; ideally cannot delete or demote *their own* account.
- [ ] **Last-admin protection:** don't allow deleting/demoting the only Admin of
      an org (otherwise the org becomes unmanageable).
- [ ] **Email uniqueness** is global (unique index on `users.email`).
- [ ] **Disabled users / suspended orgs** cannot log in (check in login + in
      `get_current_user`).
- [ ] Validate inputs with Pydantic schemas (valid email, password min length).
- [ ] (Later) rate-limit `/auth/login` and `/auth/refresh`.

---

## 8. Where each piece goes (maps to the existing scaffold)

| Piece | File |
|---|---|
| `Organization`, `User` models + enums | `app/models/organization.py`, `app/models/user.py` |
| Register models for Alembic | add imports in `app/models/__init__.py` |
| Request/response schemas | `app/schemas/auth.py`, `app/schemas/user.py`, `app/schemas/organization.py` |
| `get_current_user`, `require_role` | `app/core/dependencies.py` |
| Password/JWT helpers | `app/core/security.py` (already done — reuse) |
| Temp-password generator | `app/utils/passwords.py` (small new helper) |
| Login / token / change-password logic | `app/services/auth_service.py` |
| User invite/CRUD logic | `app/services/user_service.py` |
| Org CRUD logic | `app/services/organization_service.py` |
| Email sending (Gmail SMTP) | `app/services/email_service.py` |
| Routers | `app/routers/auth.py`, `users.py`, `admin.py` (register each in `app/main.py`) |
| First-superadmin seed | `app/scripts/create_superadmin.py` |
| DB migration for both tables | `alembic revision --autogenerate -m "auth: orgs + users"` then `alembic upgrade head` |

New `.env` values to add (and document in `.env.example`):
```
SUPERADMIN_EMAIL=owner@dpdpashield.com
SUPERADMIN_PASSWORD=change-me-on-first-login

# --- Email (Gmail SMTP via App Password) ---
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=youraccount@gmail.com      # the Gmail address that sends invites
SMTP_PASSWORD=your-16-char-app-password   # Google "App Password", NOT your login pw
SMTP_FROM_NAME=DPDPA Shield          # display name shown to recipients
```

> **Gmail App Password**, not your normal password: enable 2-Step Verification on
> the Google account, then create an App Password at
> <https://myaccount.google.com/apppasswords> and paste the 16-character value
> into `SMTP_PASSWORD`. Email is sent over STARTTLS on port 587.

---

## 9. Suggested build order (do it in these slices)

1. **Models + migration.** `Organization`, `User`, the two enums; register in
   `models/__init__.py`; generate & apply the Alembic migration. Verify the
   tables appear in the DB.
2. **Seed script.** `create_superadmin.py`. Run it; confirm one superadmin row
   exists. (Now you have an account to test with.)
3. **Schemas.** `LoginRequest`, `TokenResponse`, `ChangePasswordRequest`,
   `UserRead`, `UserInvite`, `UserUpdate`, `OrganizationCreate`, `OrganizationRead`.
4. **Dependencies.** `get_current_user` (decode → load → must-change gate) and
   `require_role(*roles)`.
5. **Auth router.** `/login`, `/me`, `/change-password`, `/refresh`. Test the full
   first-login → forced change flow with the superadmin.
6. **Email service (Gmail SMTP).** `send_invite` sends a real email through Gmail
   using the `SMTP_*` values from `.env`. Use Python's built-in `smtplib` +
   `email.message.EmailMessage` (no extra dependency needed), or `aiosmtplib` if
   you want it async. Test it by inviting yourself and confirming the mail
   arrives with the temp password. If the `SMTP_*` vars are missing, raise a
   clear config error rather than failing silently.
7. **Users router.** invite / list / update / delete / resend, with org isolation
   and the privilege rules. Test as an Admin.
8. **Admin router.** organization CRUD + cross-org user listing. Test as Superadmin.
9. **Edge cases & tests.** last-admin protection, disabled login, wrong-org access
   returns 403/404, escalation attempts rejected.

**Definition of done:** Superadmin can create an org + its admin → that admin
gets a temp password (by email) → logs in → is forced to set a new password →
can then invite a normal user → normal user logs in but cannot see the user-
management endpoints (403). Superadmin can list/manage everything across orgs.

---

## 10. Decisions intentionally deferred (don't build yet)

- Email/OTP **identity verification** beyond the temp password.
- **Forgot-password / reset-by-email** self-service (we can add later; for now an
  Admin can `resend-invite`).
- **Refresh-token rotation / server-side revocation** (start stateless; harden later).
- **Granular permissions** beyond the 3 roles (a `permissions` table) — not needed
  for this scope.
- **Audit logging** of who-invited/deleted-whom (the platform has an `audit_logs`
  table planned; wire auth events into it when that module lands).