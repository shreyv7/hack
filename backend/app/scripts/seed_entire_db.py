"""Master seeding script to set up sandbox organization, user link, and seed all modules."""

import sys
from app.core.database import SessionLocal
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole, UserStatus
from app.core.security import hash_password
from app.utils.workspace_defaults import create_default_organization_settings

def run_seeding():
    db = SessionLocal()
    try:
        # 1. Create default organization
        org = db.query(Organization).filter(Organization.slug == "zeroshield-sandbox-org").first()
        if not org:
            org = Organization(
                name="ZeroShield Sandbox Org",
                slug="zeroshield-sandbox-org",
                status=OrganizationStatus.active,
            )
            db.add(org)
            db.flush()
            
            # Setup default organization settings
            settings_obj = create_default_organization_settings(org.id)
            db.add(settings_obj)
            db.commit()
            db.refresh(org)
            print(f"Created organization: {org.name} ({org.id})")
        else:
            print(f"Organization already exists: {org.name}")

        # 2. Create or update the superadmin user
        email = "superadmin@zeroshield.in"
        password = "Admin@12345"
        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(
                organization_id=org.id,
                email=email,
                password_hash=hash_password(password),
                full_name="Platform Superadmin",
                role=UserRole.superadmin,
                status=UserStatus.active,
                must_change_password=False,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            print(f"Created superadmin user {email}")
        else:
            user.organization_id = org.id
            user.password_hash = hash_password(password)
            user.status = UserStatus.active
            user.must_change_password = False
            db.commit()
            db.refresh(user)
            print(f"Updated superadmin user {email} password and organization")

        # 3. Seed DPIA templates and Control library
        print("Seeding DPIA Templates...")
        from app.scripts.seed_dpia import main as seed_dpia_main
        try:
            seed_dpia_main()
        except Exception as e:
            print(f"DPIA seed skipped or error: {e}")

        # 4. Seed DPDP Obligations
        print("Seeding DPDP Obligations...")
        from app.scripts.seed_dpdp_obligations import main as seed_dpdp_main
        try:
            seed_dpdp_main()
        except Exception as e:
            print(f"DPDP Obligations seed skipped or error: {e}")

        # 5. Seed Consent Demo Purposes & Notice
        print("Seeding Consent Demo...")
        from app.scripts.seed_consent_demo import seed_consent_demo
        try:
            seed_consent_demo()
        except Exception as e:
            print(f"Consent seed skipped or error: {e}")

        # 6. Seed notice campaigns
        print("Seeding Notice Campaigns...")
        from app.scripts.seed_notice_campaigns import seed_notice_campaigns
        try:
            seed_notice_campaigns()
        except Exception as e:
            print(f"Notice Campaigns seed skipped or error: {e}")

        # 7. Seed RoPA corporate hierarchy and activities
        print("Seeding RoPA...")
        from app.scripts.seed_ropa import seed_ropa
        try:
            seed_ropa()
        except Exception as e:
            print(f"RoPA seed skipped or error: {e}")

        # 8. Seed CISO command center, frameworks, controls, risks, remediation tasks
        print("Seeding CISO Command Center...")
        from app.scripts.seed_ciso import seed_ciso
        try:
            seed_ciso()
        except Exception as e:
            print(f"CISO seed skipped or error: {e}")

        print("=== DATABASE SEEDING COMPLETED SUCCESSFULLY ===")

    except Exception as e:
        print(f"Error during master seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_seeding()
