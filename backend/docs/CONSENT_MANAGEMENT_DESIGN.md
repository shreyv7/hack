# Consent Management (Tier 1.1)

Org-scoped **Purpose Registry** and **Consent Notice Builder** with immutable notice versioning and notice–purpose many-to-many links. Implements DPDPA Sections 5 (Notice) and 6 (Consent).

## Legal mapping

| DPDPA | Feature | Enforcement |
|-------|---------|-------------|
| §5 Notice | Notice builder fields | `opening_statement`, DPO/contact, rights, complaint, retention |
| §6(1) Specific consent | Purpose registry + links | Each purpose: categories, retention, legal basis; publish requires ≥1 purpose |
| §6(3) Plain language + contact | Language + DPO block | Compliance warning if no DPO/contact email |
| §6(4–6) Withdrawal | Rights exercise text | Warning if consent purposes lack withdrawal language |
| §6(10) Proof burden | Immutable `live` versions | Draft-only edits; publish sets `published_at` / `published_by_user_id` |

## Auth

Same as workspace settings:

- JWT required (`get_current_user`)
- Org member reads; **admin** (or superadmin with `?org_id=`) writes
- Organization must be `active` or `pending`

## Endpoints

Base prefix: `/api/consent`

### Purposes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/purposes` | List purposes (`?include_archived=false`) |
| POST | `/purposes` | Create purpose |
| GET | `/purposes/{id}` | Detail + linked notice summaries |
| PATCH | `/purposes/{id}` | Update purpose |
| DELETE | `/purposes/{id}` | Soft-archive (blocked if linked to live notice) |

### Notices

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notices` | List notice summaries |
| POST | `/notices` | Create notice + draft v1 |
| GET | `/notices/{id}` | Notice + version history |
| GET | `/notices/{id}/versions/{version_id}` | Full version + purposes |
| PATCH | `/notices/{id}/versions/{version_id}` | Update draft content only |
| PUT | `/notices/{id}/versions/{version_id}/purposes` | Replace linked purposes (draft only) |
| POST | `/notices/{id}/versions/{version_id}/publish` | Publish draft (blocks on warnings) |
| POST | `/notices/{id}/versions/{version_id}/compliance-check` | Recompute warnings (`?auto_fix=true`) |
| POST | `/notices/{id}/draft-from-live` | New draft copied from live version |
| POST | `/notices/{id}/archive` | Archive notice |

Superadmin: append `?org_id=<uuid>` to all routes.

## Versioning

1. Create notice → draft v1
2. Edit draft → PATCH same row
3. Publish → status `live`; prior live → `archived`
4. Edit published → `POST .../draft-from-live` → new draft vN+1
5. Live rows are never mutated

## Models

- `purposes`
- `consent_notices`
- `consent_notice_versions`
- `notice_version_purposes` (junction)

## Seed

```bash
python -m app.scripts.seed_consent_demo
```

## Tests

```bash
python -m app.scripts.test_consent_api
```

## Frontend

- `frontend/src/types/consent.ts`
- `frontend/src/lib/api/consent.ts`
- `frontend/src/hooks/useConsentManagement.ts`
- Pages: `PurposeRegistryNew`, `ConsentNoticesManager`, `NewConsentNotice`
