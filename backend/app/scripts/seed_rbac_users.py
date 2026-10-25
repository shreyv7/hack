"""Seed one sample user per DPDPA RBAC role for local development."""

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole, UserStatus

ROLE_SAMPLES: list[tuple[UserRole, str, str]] = [
    (UserRole.ciso, "CISO Demo", "ciso@zeroshield.in"),
    (UserRole.legal_head, "Legal Head Demo", "legal.head@zeroshield.in"),
    (UserRole.legal_counsel, "Legal Counsel Demo", "legal.counsel@zeroshield.in"),
    (UserRole.compliance_officer, "Compliance Officer Demo", "compliance@zeroshield.in"),
    (UserRole.grievance_officer, "Grievance Officer Demo", "grievance@zeroshield.in"),
    (UserRole.security_analyst, "Security Analyst Demo", "security@zeroshield.in"),
    (UserRole.data_steward, "Data Steward Demo", "steward@zeroshield.in"),
    (UserRole.auditor, "Auditor Demo", "auditor@zeroshield.in"),
    (UserRole.dpo, "DPO Demo", "dpo@zeroshield.in"),
    (UserRole.it_admin, "IT Admin Demo", "itadmin@zeroshield.in"),
]

DEFAULT_PASSWORD = "RoleDemo@12345"


def seed_rbac_users(org_slug: str = "zeroshield-sandbox-org") -> None:
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
                    organization_id=org.id,
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
                user.organization_id = org.id
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
