# HealthShield backend integration

Track A implements the healthcare contract in `PARALLEL_DEV_PLAN.md` and the
six AI operations in `TRACK_A_BACKEND_AI.md`. Healthcare uses
`/api/v1/healthcare`, independently of the legacy `API_V1_PREFIX` (default `/api`).

## Run locally

Use Python 3.11+, the existing backend setup, and a PostgreSQL database with
the credentials in your local `DATABASE_URL`. From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Swagger is available at `http://localhost:8000/docs`. The healthcare migration
is `20261025_healthcare`, following `20260731_merge_email_campaign`.

Set `GEMINI_API_KEY` and optionally `GEMMA_MODEL_ID` in the local backend
environment to use the provider. The default model is `gemma-4-31b-it`;
[Google's model list](https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api)
documents that identifier. An empty key enables explicitly marked offline
fallbacks. Legacy Shield AI and its embeddings still use Vertex or Bedrock,
selected with `SHIELD_AI_PROVIDER`; the healthcare client is separate.

## Authentication and frontend handoff

All healthcare routes require `Authorization: Bearer <access_token>` from the
existing login endpoint, normally `POST /api/auth/login`. Use an active account
in an active organization with any required password change completed.

- Seed the demo with an admin or DPO account using
  `POST /api/v1/healthcare/seed-demo`. Save its returned `patient_id`: the first
  hospital uses `p-101`, while additional hospitals receive distinct IDs. Seeding
  is idempotent and never restores revoked consent. It is disabled in production
  and staging.
- Read the profile and consent list at `/patients/{patient_id}` and
  `/patients/{patient_id}/consents`. Raw phone numbers are not stored; `phone`
  is `null`.
- Grant or replace consent using `POST /patients/{patient_id}/consents`.
  Revoke using `POST /patients/{patient_id}/consents/{consent_id}/revoke`
  or `DELETE /patients/{patient_id}/consents/{consent_id}`. Both writes require
  admin or DPO authority. A replacement revokes the previous active grant for
  that purpose. Categories without a current grant remain redacted.
- For `/access/evaluate`, `/access/break-the-glass`, and `/ai/advise-access`,
  send the authenticated user's actual ID as `clinician_id`, rather than the
  illustrative `doc-402`. Obtain the ID from the existing `/api/auth/me` route
  (or its configured legacy prefix). Patient and clinician self-service identity
  roles are not yet modeled; hospital users perform clinical evaluations and
  authorized managers administer consent.
- Emergency access requires at least 20 characters of justification. The override
  lasts 30 minutes for that patient, clinician, and department, and is reused only
  for purpose `emergency`. It never modifies ordinary treatment consent. Audit
  proof metadata cites Section 7(f) for medical emergencies.
- Compliance roles can read `/audit/decisions` and `/audit/emergency-overrides`.
  Admin/DPO users mark an override reviewed via
  `POST /audit/emergency-overrides/{override_id}/review`.
- `GET /audit/verify` checks the hash chain and returns its Merkle root without
  writing a verification record. Auditors use this route to retain read-only
  access. `POST /audit/verify` also stores a verification record and remains
  unavailable to the globally read-only auditor role.

These paths are relative to `/api/v1/healthcare` unless a full path is shown.
Shared legacy and healthcare Proof Vault writes acquire the same organization
row lock before reading the chain head. Decision and proof writes commit before
record data is returned; failures roll back the transaction.

## AI operations

The six POST routes under `/api/v1/healthcare/ai` are:

| Path | Input |
| --- | --- |
| `/digitize-consent` | Multipart field `image`: PNG, JPEG, or WebP, up to 5 MB |
| `/explain-consent` | `purpose`, `categories`, and `language` |
| `/advise-access` | `patient_id`, authenticated `clinician_id`, and `query` |
| `/analyze-compliance-gaps` | Optional body containing `policies: string[]` |
| `/classify-ehr` | `clinical_text` |
| `/generate-policy` | `department` |

`/classify-ehr-sensitivity` and `/generate-consent-policy` are also supported.
The explainer accepts English, Hindi, Kannada, Tamil, Telugu, Malayalam, Marathi,
and Bengali.

Every result includes `source: "gemma"` or `source: "fallback"`. Fallbacks also
include `fallback_reason` (`missing_api_key`, `invalid_output`, or `provider_error`).
Provider JSON is validated locally. Extraction always returns `requires_review`
and never grants consent. Offline extraction returns no inferred purposes or
signature. AI advice never authorizes clinical record access; only the
deterministic gateway evaluates consent.

## Verification

```powershell
# Self-contained healthcare/API, AI boundary, and migration checks
.\.venv\Scripts\python.exe -m pytest tests/test_healthcare.py tests/test_gemma_client.py tests/test_healthcare_migration.py -q

# Entire backend suite, including legacy tests that require PostgreSQL
.\.venv\Scripts\python.exe -m pytest -q
```

The healthcare tests use SQLite, and migration tests check PostgreSQL SQL plus
SQLite upgrade/downgrade. The locking regression inspects emitted queries using
the PostgreSQL dialect. These checks do not establish live PostgreSQL concurrent
transaction behavior. Provider boundary tests use a fake SDK and offline
fallbacks; successful live Gemma requests and image extraction still need a
configured provider smoke test.
