"""Create or reset the local test admin user (idempotent).

Run from backend/:
    python -m app.scripts.create_test_user
"""

import sys

from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole, UserStatus
from app.utils.text import slugify
from app.utils.workspace_defaults import create_default_organization_settings

TEST_EMAIL = "test@gmail.com"
TEST_PASSWORD = "test1234"
TEST_ORG_NAME = "Test Organization"


def main() -> None:
    if len(TEST_PASSWORD) < 8:
        print("TEST_PASSWORD must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        email = TEST_EMAIL.strip().lower()
        user = db.query(User).filter(User.email == email).first()

        org = db.query(Organization).filter(Organization.name == TEST_ORG_NAME).first()
        if org is None:
            base_slug = slugify(TEST_ORG_NAME) or "test-org"
            slug = base_slug
            n = 1
            while db.query(Organization).filter(Organization.slug == slug).first():
                slug = f"{base_slug}-{n}"
                n += 1
            org = Organization(name=TEST_ORG_NAME, slug=slug, status=OrganizationStatus.active)
            db.add(org)
            db.flush()
            db.add(create_default_organization_settings(org.id))

        if user is None:
            user = User(
                organization_id=org.id,
                email=email,
                password_hash=hash_password(TEST_PASSWORD),
                full_name="Test Admin",
                role=UserRole.admin,
                status=UserStatus.active,
                must_change_password=False,
            )
            db.add(user)
            db.commit()
            print(f"Created test user: {email} / {TEST_PASSWORD} (org: {org.name})")
        else:
            user.password_hash = hash_password(TEST_PASSWORD)
            user.organization_id = org.id
            user.role = UserRole.admin
            user.status = UserStatus.active
            user.must_change_password = False
            db.commit()
            print(f"Reset test user: {email} / {TEST_PASSWORD} (org: {org.name})")
    finally:
        db.close()


if __name__ == "__main__":
    main()
