# RBAC Permission Matrix

Central definition: [`backend/app/core/rbac.py`](../../backend/app/core/rbac.py).  
Frontend mirror: [`frontend/src/lib/auth/permissions.ts`](../../frontend/src/lib/auth/permissions.ts).

## Roles

| Role | Label | Primary responsibility |
|------|-------|------------------------|
| `superadmin` | Superadmin | Platform-wide administration |
| `admin` | Admin | Organization administration (users, settings) |
| `user` | User | Operational DSAR handler |
| `ciso` | CISO | Breach escalation owner, security policy override |
| `legal_head` | Legal Head | Final legal sign-off (DSAR, consent/DPO approval) |
| `legal_counsel` | Legal Counsel | Draft/review legal responses |
| `compliance_officer` | Compliance Officer | Compliance score, audit writes, task assignment |
| `grievance_officer` | Grievance Redressal Officer | Default grievance assignee, SLA ownership |
| `security_analyst` | Security Analyst | Breach triage and logging |
| `data_steward` | Data Steward | Scoped data asset approvals |
| `auditor` | Auditor | Read-only across all modules |
| `dpo` | Data Protection Officer | Statutory DPO (DPDPA Sec. 9/10): named regulatory contact for DPDPB/CERT-In; consent approve, audit write, workspace DPO settings |
| `it_admin` | IT Admin | Technical settings owner: API keys, webhooks, data sources, integrations, retention. No compliance governance or user management. |

## Module permissions

| Module | superadmin / admin | ciso | legal_head | legal_counsel | compliance_officer | grievance_officer | security_analyst | data_steward | auditor | user | dpo | it_admin |
|--------|-------------------|------|------------|---------------|-------------------|-------------------|------------------|--------------|---------|------|-----|----------|
| DSAR read | yes | yes | yes | yes | yes | yes | — | yes | yes | yes | yes | — |
| DSAR write | yes | — | — | draft | — | yes | — | — | — | yes | — | — |
| DSAR assign | yes | — | — | — | — | yes | — | — | — | — | — | — |
| DSAR legal sign-off | yes | — | yes | — | — | — | — | — | — | — | yes | — |
| Grievance manage | yes | — | — | — | — | yes | — | — | — | — | — | — |
| Breach triage/log | yes | — | — | — | read | — | yes | — | read | read | read | — |
| Breach close | yes | yes | — | — | — | — | — | — | — | — | — | — |
| Consent approve | yes | — | yes | review | — | — | — | — | read | read | yes | — |
| Consent write | yes | — | — | — | — | — | — | — | — | — | yes | — |
| Audit read | yes | yes | yes | yes | yes | — | yes | — | yes | yes | yes | — |
| Audit write | yes | — | — | — | yes | — | — | — | — | — | yes | — |
| Compliance manage | yes | dashboard | read | read | yes | read | read | read | read | read | dashboard | read |
| Security override | yes | yes | — | — | — | — | — | — | read | read | — | read+write |
| Data asset scoped | yes | — | — | — | read | — | ... | yes | read | read | — | read+write |
| User manage | yes | — | — | — | — | — | — | — | — | — | — | — |
| Workspace manage | yes | — | — | — | — | — | — | — | — | — | yes | yes |

## Workflow routing

| Trigger | Routed to |
|---------|-----------|
| Grievance verified (portal OTP) | First active `grievance_officer` in org |
| New breach incident created | First active `security_analyst` (assignee) |
| Breach escalate action | First active `ciso` (or explicit user) |
| Breach close action | User with `BREACH_CLOSE` (CISO / admin) |
| Notice `legal_review` transition | `CONSENT_REVIEW` (legal_counsel, legal_head) |
| Notice `dpo_approval` transition | `CONSENT_APPROVE` (legal_head, **dpo**) |
| DSAR `requires_legal_signoff` | Legal Head / **DPO** via `/dsar/requests/{id}/legal-signoff` |

## Auditor enforcement

- **UI:** `canEdit()` returns false; write actions hidden.
- **API:** `get_current_user` rejects non-GET/HEAD/OPTIONS for `auditor` role (except auth self-service).

## Dev seeds

Run after sandbox org exists:

```bash
cd backend
python -m app.scripts.seed_rbac_users
```

Demo password: `Vajra@2026Demo!` (one user per role at `*@vajra.dev`).

| Role | Email |
|------|-------|
| Superadmin | `superadmin@vajra.dev` |
| Admin | `admin@vajra.dev` |
| User | `user@vajra.dev` |
| CISO | `ciso@vajra.dev` |
| Legal Head | `legal.head@vajra.dev` |
| Legal Counsel | `legal.counsel@vajra.dev` |
| Compliance Officer | `compliance@vajra.dev` |
| Grievance Officer | `grievance@vajra.dev` |
| Security Analyst | `security@vajra.dev` |
| Data Steward | `steward@vajra.dev` |
| Auditor | `auditor@vajra.dev` |
| **DPO** | `dpo@vajra.dev` |
| **IT Admin** | `itadmin@vajra.dev` |
| Branch Operator | `branch.operator@vajra.dev` |
