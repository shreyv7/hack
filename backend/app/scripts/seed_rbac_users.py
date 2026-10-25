"""Seed one active Vajra demo user per RBAC role for local development."""

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole, UserStatus

ROLE_SAMPLES: list[tuple[UserRole, str, str]] = [
    (UserRole.superadmin, "Vajra Superadmin", "superadmin@vajra.dev"),
    (UserRole.admin, "Vajra Admin", "admin@vajra.dev"),
    (UserRole.user, "Vajra Operations User", "user@vajra.dev"),
    (UserRole.ciso, "Vajra CISO", "ciso@vajra.dev"),
    (UserRole.legal_head, "Vajra Legal Head", "legal.head@vajra.dev"),
    (UserRole.legal_counsel, "Vajra Legal Counsel", "legal.counsel@vajra.dev"),
    (UserRole.compliance_officer, "Vajra Compliance Officer", "compliance@vajra.dev"),
    (UserRole.grievance_officer, "Vajra Grievance Officer", "grievance@vajra.dev"),
    (UserRole.security_analyst, "Vajra Security Analyst", "security@vajra.dev"),
    (UserRole.data_steward, "Vajra Data Steward", "steward@vajra.dev"),
    (UserRole.auditor, "Vajra Auditor", "auditor@vajra.dev"),
    (UserRole.dpo, "Vajra DPO", "dpo@vajra.dev"),
    (UserRole.it_admin, "Vajra IT Admin", "itadmin@vajra.dev"),
    (UserRole.branch_operator, "Vajra Branch Operator", "branch.operator@vajra.dev"),
]

DEFAULT_PASSWORD = "Vajra@2026Demo!"


def seed_rbac_users(org_slug: str = "vajra-sandbox-org") -> None:
    db = SessionLocal()
    try:
        org = db.query(Organization).filter(Organization.slug == org_slug).first()
        if org is None:
            print(f"Organization {org_slug} not found — run seed_entire_db first")
            return

        for role, full_name, email in ROLE_SAMPLES:
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                user = User(
                    organization_id=None if role == UserRole.superadmin else org.id,
                    email=email,
                    password_hash=hash_password(DEFAULT_PASSWORD),
                    full_name=full_name,
                    role=role,
                    status=UserStatus.active,
                    must_change_password=False,
                )
                db.add(user)
                print(f"Created {role.value}: {email}")
            else:
                user.organization_id = None if role == UserRole.superadmin else org.id
                user.full_name = full_name
                user.role = role
                user.status = UserStatus.active
                user.must_change_password = False
                user.password_hash = hash_password(DEFAULT_PASSWORD)
                print(f"Updated {role.value}: {email}")

        db.commit()
        print(f"RBAC demo users ready (password: {DEFAULT_PASSWORD})")
    finally:
        db.close()


if __name__ == "__main__":
    seed_rbac_users()
