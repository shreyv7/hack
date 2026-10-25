# Workspace & Settings (Tier 0.2)

Org-scoped workspace configuration for Vajra. Each active organization has one `organization_settings` row (auto-created on org signup or superadmin create) plus optional `data_processors` entries. Obligation comparison rows come from a seeded `dpdp_obligation_definitions` catalog.

## Question mapping (Q1–Q11)

| Q | Topic | Storage | API |
|---|--------|---------|-----|
| Q1 | Legal / registered address | `organization_settings.registered_address` | `PATCH /workspace/profile` |
| Q2 | HQ & India presence | `headquarters`, `india_presence` | `PATCH /workspace/profile` |
| Q3 | Solution description | `solution_description` | `PATCH /workspace/profile` |
| Q4 | Logo | `logo_url` (URL string only) | `PATCH /workspace/profile` |
| Q5 | Deployment model | `deployment_model`, regions | `PATCH /workspace/deployment` |
| Q6 | Data residency matrix | `data_residency` (JSON) | `PATCH /workspace/deployment` |
| Q7 | Compliance / audit metadata | `compliance_version`, `changelog_summary`, attestation fields | `PATCH /workspace/profile` |
| Q8 | Industry & SDF flags | `primary_industry`, `secondary_industries`, SDF bands | `PATCH /workspace/industry` |
| Q9–Q10 | DPDP role & assessment | `dpdp_role`, `role_assessment`, `role_assessed_at` | `PATCH /workspace/role-mapping` |
| Q11 | Data processors | `data_processors` table | `GET/POST/PATCH/DELETE /workspace/processors` |

Display name for the tenant: `organizations.name` (editable via `org_name` on profile PATCH).

## Auth

- All routes require a valid JWT (`get_current_user`).
- User must belong to an organization (`organization_id` not null); otherwise **403**.
- Organization must be `active` or `pending` (signup flow).
- **Writes** (PATCH sections, processor mutations): `UserRole.admin` only.
- **Reads**: any org member (`admin` or `user`).
- Superadmin without org context cannot access workspace APIs (deferred: `?org_id=`).

## Endpoints

Base prefix: `/api/workspace` (see `app/routers/workspace.py`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Full settings aggregate + `processors[]` |
| PATCH | `/profile` | Profile, DPO, compliance, optional `org_name` |
| PATCH | `/industry` | Industry & SDF |
| PATCH | `/deployment` | Deployment & residency |
| PATCH | `/role-mapping` | Role + assessment; SDF flag set when role is `significant_data_fiduciary` |
| GET | `/obligations` | Seeded obligation catalog |
| GET | `/processors` | List processors |
| POST | `/processors` | Create processor |
| PATCH | `/processors/{id}` | Update processor |
| DELETE | `/processors/{id}` | Delete processor |

## Models

- `organization_settings` — 1:1 with `organizations`
- `data_processors` — N per org
- `dpdp_obligation_definitions` — global seed (~9 rows)

Auto-create: `OrganizationService.create_with_admin`, `AuthService.signup`, migration backfill for existing orgs.

## Seed

```bash
python -m app.scripts.seed_dpdp_obligations
```

Also runs on `alembic upgrade` when the catalog is empty.

## Frontend

- `frontend/src/lib/api/workspace.ts`
- `frontend/src/hooks/useWorkspaceSettings.ts`
- Settings pages under Workspace → Settings nav
