# Track A execution record

Scope: backend only. Implement the shared healthcare API contract, consent enforcement,
Proof Vault integration, demo seeding and six Gemma functions. Frontend is independently owned.

Sequence:
1. Establish test environment and contract tests.
2. Add models, migration, schemas, consent engine and demo seed.
3. Add Gemma gateway with validated output and explicit offline fallbacks.
4. Register authenticated, tenant-scoped healthcare routes and verify integration.
5. Run the existing suite and review the complete change.

Decisions:
- Ruling: Work in the provided checkout and edit backend files only; avoid moving the user's workspace or modifying git state during parallel development. Cost: no separate worktree isolation.
- Ruling: Register healthcare at /api/v1 independently of the legacy /api prefix. Cost: healthcare has a fixed versioned namespace.
- Ruling: Add organization scoping and use existing bearer authentication. Consent changes require admin/DPO authority; clinician IDs must match the authenticated user. Existing roles stand in for healthcare personas until dedicated patient/clinician identity flows exist. Cost: the frontend must send a bearer token and the user's actual ID.
- Ruling: Use gemma-4-31b-it as the default rather than the plan's unlisted gemma-4-27b-it; Google's current supported-model list names gemma-4-31b-it and gemma-4-26b-a4b-it (https://ai.google.dev/gemma/docs/core/gemma_on_gemini_api). Cost: deployments must have access to a supported model, configurable via GEMMA_MODEL_ID.
- Ruling: Keep legacy Shield AI provider routing intact through an explicit legacy-provider property while AI_PROVIDER defaults to gemma for healthcare. Cost: legacy modules still need Vertex/Bedrock configuration.
- Ruling: Use Section 7(f) for medical emergency citations, correcting the contract example's Section 7(a). Source: https://www.indiacode.nic.in/bitstream/123456789/22037/2/a2023-22.pdf. Cost: citation text differs from example copy.

Continuation decisions:
- Ruling: Keep the existing checkout and backend-only boundary, and retain the
  existing execution record rather than create another plan/worktree for resumed
  verification. Cost: changes remain uncommitted in the shared working tree.
- Ruling: Serialize all Proof Vault appends in the shared service, including
  legacy writers, instead of locking only healthcare appends. Cost: writes within
  one organization are serialized; correctness depends on PostgreSQL transaction
  locking and still requires a live concurrency check.
- Ruling: Add GET /healthcare/audit/verify without persistence for read-only
  auditors; retain POST verification for roles allowed to write verification
  records. Cost: auditors must use GET, preserving the existing global ban on
  auditor POST requests.
- Ruling: Preserve existing expanded AI paths and DELETE revocation while adding
  the shorter SRS2 paths and POST revocation aliases. Cost: more documented route
  aliases to maintain.

Execution status:
1. Test environment and contract tests: complete.
2. Models, migration, schemas, consent engine, and demo seed: implemented and
   verified with SQLite and PostgreSQL migration SQL generation.
3. Six-function Gemma gateway: implemented; SDK boundary validation, failure
   handling, eight-language fallbacks, and offline behavior verified.
4. Authenticated, tenant-scoped healthcare routes: registered and covered by API
   integration tests, including an actual JWT-backed read-only auditor.
5. Whole-change review: completed by a separate read-only reviewer; findings
   addressed and verified. Integration guide: HEALTHCARE.md.

Final fixes (regressions observed failing before the corresponding fix):
- Validation errors containing a ValueError now serialize to HTTP 422, instead
  of crashing the main app's JSONResponse with HTTP 500.
  Test: test_main_app_registers_contract_and_returns_422_for_overlapping_categories.
- Compliance analysis accepts the contract's request without a JSON body.
  Test: test_compliance_analysis_accepts_contract_request_without_body.
- Common organization row locking precedes chain-head reads for legacy and
  healthcare Proof Vault appends, including genesis.
  Test: test_all_proof_writers_lock_organization_before_reading_chain_head.
- SRS2 AI and revocation routes are available alongside the existing names.
  Tests: test_documented_ai_paths and test_documented_revoke_path.
- Auditor verification works through real bearer authentication without granting
  write access or inserting verification records.
  Test: test_real_auditor_can_verify_read_only_without_write_authority.

Verification (2026-10-25):
- Full backend: `.\.venv\Scripts\python.exe -m pytest -q --tb=no`:
  143 passed, 3 failed, 18 existing dependency deprecation warnings.
- All three failures are existing PostgreSQL-backed tests in
  tests/test_legitimate_use.py: test_lia_warnings_validation,
  test_dsar_erasure_legitimate_use_conflict, and test_compliance_score_deductions.
  PostgreSQL rejects the configured local dpdpa login. No database credentials,
  users, or services were changed to work around this environment failure.
- Focused healthcare, Gemma, and migration suite:
  `.\.venv\Scripts\python.exe -m pytest tests/test_healthcare.py tests/test_gemma_client.py tests/test_healthcare_migration.py -q --tb=short`:
  52 passed, 18 existing dependency deprecation warnings.
- `git diff --check`: passed. Changes remain within backend/.

Remaining external verification:
- Run migrations and test concurrent legacy/healthcare appends against an
  authenticated PostgreSQL database. SQL generation and lock-query checks do
  not substitute for a live PostgreSQL concurrency test.
- Smoke-test live Gemma image/JSON requests with a configured provider. Current
  tests use offline fallbacks and an SDK double, with no paid provider calls.
- Frontend integration and merging remain with the independently owned track.
  Existing bearer identity and admin/DPO consent-management requirements must be
  applied by the frontend; this backend does not model patient self-service roles.
