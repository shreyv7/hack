"""
Central RBAC — role → permission matrix and FastAPI dependencies.

Single source of truth for authorization. Services should call has_permission()
instead of inline user.role checks.
"""

from __future__ import annotations

import enum
from collections.abc import Callable
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole


class Permission(str, enum.Enum):
    # DSAR / grievance
    DSAR_READ = "dsar.read"
    DSAR_WRITE = "dsar.write"
    DSAR_ASSIGN = "dsar.assign"
    DSAR_LEGAL_DRAFT = "dsar.legal_draft"
    DSAR_LEGAL_SIGNOFF = "dsar.legal_signoff"
    GRIEVANCE_MANAGE = "grievance.manage"
    GRIEVANCE_ESCALATED_APPROVE = "grievance.escalated_approve"
    GRIEVANCE_COMMENT = "grievance.comment"

    # Breach
    BREACH_READ = "breach.read"
    BREACH_LOG = "breach.log"
    BREACH_TRIAGE = "breach.triage"
    BREACH_CLOSE = "breach.close"
    BREACH_ESCALATION_RECEIVE = "breach.escalation_receive"

    # Consent / notices
    CONSENT_READ = "consent.read"
    CONSENT_WRITE = "consent.write"
    CONSENT_REVIEW = "consent.review"
    CONSENT_APPROVE = "consent.approve"
    CONSENT_CAPTURE_ASSISTED = "consent.capture_assisted"

    # Audit
    AUDIT_READ = "audit.read"
    AUDIT_WRITE = "audit.write"

    # Compliance / security
    COMPLIANCE_READ = "compliance.read"
    COMPLIANCE_MANAGE = "compliance.manage"
    COMPLIANCE_DASHBOARD = "compliance.dashboard"
    SECURITY_READ = "security.read"
    SECURITY_WRITE = "security.write"
    SECURITY_POLICY_OVERRIDE = "security.policy_override"

    # Data assets (RoPA / inventory)
    DATA_ASSET_READ = "data_asset.read"
    DATA_ASSET_WRITE = "data_asset.write"
    DATA_ASSET_APPROVE_SCOPED = "data_asset.approve_scoped"

    # Org admin
    USER_MANAGE = "user.manage"
    WORKSPACE_MANAGE = "workspace.manage"

    # Cross-module task assignment
    TASK_ASSIGN = "task.assign"


ALL_READ_PERMISSIONS = frozenset(
    p for p in Permission if p.value.endswith(".read") or p == Permission.COMPLIANCE_DASHBOARD
)

# Broad write set for legacy admin roles
_ADMIN_WRITE = frozenset(
    p
    for p in Permission
    if p not in ALL_READ_PERMISSIONS
    and p
    not in (
        Permission.DSAR_LEGAL_SIGNOFF,
        Permission.BREACH_CLOSE,
        Permission.BREACH_ESCALATION_RECEIVE,
        Permission.GRIEVANCE_ESCALATED_APPROVE,
        Permission.CONSENT_APPROVE,
        Permission.SECURITY_POLICY_OVERRIDE,
        Permission.DATA_ASSET_APPROVE_SCOPED,
    )
)

ROLE_PERMISSIONS: dict[UserRole, frozenset[Permission]] = {
    UserRole.superadmin: frozenset(Permission),
    UserRole.admin: frozenset(Permission),
    UserRole.user: frozenset(
        {
            Permission.DSAR_READ,
            Permission.DSAR_WRITE,
            Permission.CONSENT_READ,
            Permission.COMPLIANCE_READ,
            Permission.BREACH_READ,
            Permission.AUDIT_READ,
            Permission.DATA_ASSET_READ,
            Permission.SECURITY_READ,
        }
    ),
    UserRole.ciso: frozenset(
        {
            Permission.BREACH_READ,
            Permission.BREACH_CLOSE,
            Permission.BREACH_ESCALATION_RECEIVE,
            Permission.AUDIT_READ,
            Permission.SECURITY_READ,
            Permission.SECURITY_POLICY_OVERRIDE,
            Permission.COMPLIANCE_READ,
            Permission.COMPLIANCE_DASHBOARD,
            Permission.DSAR_READ,
        }
    ),
    UserRole.legal_head: frozenset(
        {
            Permission.DSAR_READ,
            Permission.DSAR_LEGAL_SIGNOFF,
            Permission.CONSENT_READ,
            Permission.CONSENT_APPROVE,
            Permission.GRIEVANCE_ESCALATED_APPROVE,
            Permission.AUDIT_READ,
            Permission.COMPLIANCE_READ,
            Permission.GRIEVANCE_COMMENT,
        }
    ),
    UserRole.legal_counsel: frozenset(
        {
            Permission.DSAR_READ,
            Permission.DSAR_LEGAL_DRAFT,
            Permission.CONSENT_READ,
            Permission.CONSENT_REVIEW,
            Permission.GRIEVANCE_COMMENT,
            Permission.COMPLIANCE_READ,
        }
    ),
    UserRole.compliance_officer: frozenset(
        {
            Permission.COMPLIANCE_MANAGE,
            Permission.COMPLIANCE_DASHBOARD,
            Permission.COMPLIANCE_READ,
            Permission.AUDIT_READ,
            Permission.AUDIT_WRITE,
            Permission.TASK_ASSIGN,
            Permission.DSAR_READ,
            Permission.BREACH_READ,
            Permission.CONSENT_READ,
            Permission.SECURITY_READ,
            Permission.DATA_ASSET_READ,
        }
    ),
    UserRole.grievance_officer: frozenset(
        {
            Permission.GRIEVANCE_MANAGE,
            Permission.DSAR_READ,
            Permission.DSAR_WRITE,
            Permission.DSAR_ASSIGN,
            Permission.GRIEVANCE_COMMENT,
            Permission.COMPLIANCE_READ,
        }
    ),
    UserRole.security_analyst: frozenset(
        {
            Permission.BREACH_READ,
            Permission.BREACH_TRIAGE,
            Permission.BREACH_LOG,
            Permission.SECURITY_READ,
            Permission.AUDIT_READ,
            Permission.COMPLIANCE_READ,
        }
    ),
    UserRole.data_steward: frozenset(
        {
            Permission.DATA_ASSET_READ,
            Permission.DATA_ASSET_APPROVE_SCOPED,
            Permission.COMPLIANCE_READ,
            Permission.DSAR_READ,
        }
    ),
    UserRole.auditor: ALL_READ_PERMISSIONS
    | frozenset(
        {
            Permission.COMPLIANCE_DASHBOARD,
            Permission.DSAR_READ,
            Permission.BREACH_READ,
            Permission.CONSENT_READ,
            Permission.AUDIT_READ,
            Permission.SECURITY_READ,
            Permission.DATA_ASSET_READ,
            Permission.COMPLIANCE_READ,
        }
    ),
    # ── DPDPA Section 9/10 statutory DPO ────────────────────────────────────
    # Named regulatory identity: superset of legal_head + workspace.manage so the
    # DPO can update their own contact details and breach notification settings.
    UserRole.dpo: frozenset(
        {
            Permission.DSAR_READ,
            Permission.DSAR_LEGAL_SIGNOFF,
            Permission.CONSENT_READ,
            Permission.CONSENT_WRITE,
            Permission.CONSENT_APPROVE,
            Permission.GRIEVANCE_ESCALATED_APPROVE,
            Permission.GRIEVANCE_COMMENT,
            Permission.BREACH_READ,
            Permission.AUDIT_READ,
            Permission.AUDIT_WRITE,
            Permission.COMPLIANCE_READ,
            Permission.COMPLIANCE_DASHBOARD,
            Permission.WORKSPACE_MANAGE,
        }
    ),
    # ── IT / Infrastructure Admin ────────────────────────────────────────────
    # Technical settings owner (API keys, webhooks, data sources, retention,
    # integrations). Deliberately excludes DSAR write, breach close, consent
    # approve, audit write, and user management.
    UserRole.it_admin: frozenset(
        {
            Permission.WORKSPACE_MANAGE,
            Permission.SECURITY_READ,
            Permission.SECURITY_WRITE,
            Permission.DATA_ASSET_READ,
            Permission.DATA_ASSET_WRITE,
            Permission.COMPLIANCE_READ,
        }
    ),
    UserRole.branch_operator: frozenset(
        {
            Permission.CONSENT_READ,
            Permission.CONSENT_CAPTURE_ASSISTED,
            Permission.COMPLIANCE_READ,
        }
    ),
}

ROLE_LABELS: dict[UserRole, str] = {
    UserRole.superadmin: "Superadmin",
    UserRole.admin: "Admin",
    UserRole.user: "User",
    UserRole.ciso: "CISO",
    UserRole.legal_head: "Legal Head",
    UserRole.legal_counsel: "Legal Counsel",
    UserRole.compliance_officer: "Compliance Officer",
    UserRole.grievance_officer: "Grievance Redressal Officer",
    UserRole.security_analyst: "Security Analyst",
    UserRole.data_steward: "Data Steward",
    UserRole.auditor: "Auditor",
    UserRole.dpo: "Data Protection Officer",
    UserRole.it_admin: "IT Admin",
    UserRole.branch_operator: "Branch Operator",
}

ROLE_DESCRIPTIONS: dict[UserRole, str] = {
    UserRole.superadmin: "Platform-wide administration across all organizations.",
    UserRole.admin: "Full organization administration including user management and settings.",
    UserRole.user: "Operational handler for assigned DSAR requests.",
    UserRole.ciso: "Owns breach escalations, closes incidents, overrides security policy.",
    UserRole.legal_head: "Final legal sign-off on DSAR responses and consent notices.",
    UserRole.legal_counsel: "Drafts DSAR legal responses and reviews consent notices.",
    UserRole.compliance_officer: "Manages compliance score, audit log writes, cross-module tasks.",
    UserRole.grievance_officer: "Default owner for Data Principal grievances and SLA tracking.",
    UserRole.security_analyst: "Triages and logs breach incidents; cannot close or approve.",
    UserRole.data_steward: "Approves data processing changes within assigned departments.",
    UserRole.auditor: "Read-only access across all modules; no write actions.",
    UserRole.dpo: "Statutory Data Protection Officer (DPDPA Sec. 9/10). Named regulatory contact for DPDPB, CERT-In, and data principals. Can approve consents, update workspace DPO details, and sign off audit reports.",
    UserRole.it_admin: "IT/Infrastructure Admin. Manages API keys, webhooks, data sources, integrations, and retention policy. Does not have access to compliance governance, breach closure, or user management.",
    UserRole.branch_operator: "Branch or merchant staff who capture assisted customer consent with OTP verification.",
}

INVITABLE_ROLES: frozenset[UserRole] = frozenset(
    r for r in UserRole if r != UserRole.superadmin
)


def role_permission_summary(role: UserRole) -> list[str]:
    perms = ROLE_PERMISSIONS.get(role, frozenset())
    return sorted(p.value for p in perms)


def has_permission(user: User, permission: Permission) -> bool:
    role_perms = ROLE_PERMISSIONS.get(user.role, frozenset())
    return permission in role_perms


def has_any_permission(user: User, *permissions: Permission) -> bool:
    return any(has_permission(user, p) for p in permissions)


def require_permission(*permissions: Permission) -> Callable[..., User]:
    """Dependency factory: user must hold at least one of the given permissions."""
    from app.core.dependencies import get_current_user

    def _checker(user: User = Depends(get_current_user)) -> User:
        if not has_any_permission(user, *permissions):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return _checker


def list_users_by_role(
    db: Session,
    organization_id: UUID,
    role: UserRole,
) -> list[User]:
    from app.models.user import User as UserModel, UserStatus

    return (
        db.query(UserModel)
        .filter(
            UserModel.organization_id == organization_id,
            UserModel.role == role,
            UserModel.status == UserStatus.active,
        )
        .order_by(UserModel.full_name)
        .all()
    )


def default_assignee_for_role(
    db: Session,
    organization_id: UUID,
    role: UserRole,
) -> UUID | None:
    users = list_users_by_role(db, organization_id, role)
    return users[0].id if users else None


def can_access_data_asset_scope(
    db: Session,
    user: User,
    *,
    business_unit_id: UUID | None = None,
    department_id: UUID | None = None,
) -> bool:
    """Data steward scope check. Admins/superadmins always pass."""
    if user.role in (UserRole.superadmin, UserRole.admin):
        return True
    if user.role != UserRole.data_steward:
        return has_permission(user, Permission.DATA_ASSET_WRITE)
    if user.organization_id is None:
        return False
    from app.models.user_scope_assignment import UserScopeAssignment

    scopes = (
        db.query(UserScopeAssignment)
        .filter(
            UserScopeAssignment.user_id == user.id,
            UserScopeAssignment.organization_id == user.organization_id,
        )
        .all()
    )
    if not scopes:
        return False
    for scope in scopes:
        if scope.business_unit_id is None and scope.department_id is None:
            return True
        if business_unit_id and scope.business_unit_id == business_unit_id:
            if scope.department_id is None or scope.department_id == department_id:
                return True
        if department_id and scope.department_id == department_id:
            return True
    return False
