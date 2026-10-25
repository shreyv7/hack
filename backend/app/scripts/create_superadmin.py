"""
Create or reset the platform superadmin (idempotent).

Run from backend/:

    # Create the first superadmin (does nothing if one already exists):
    python -m app.scripts.create_superadmin

    # Reset an existing superadmin's password to SUPERADMIN_PASSWORD from .env:
    python -m app.scripts.create_superadmin --reset-password

Both read SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD from your environment (.env).
"""

import argparse
import sys

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole, UserStatus


def main() -> None:
    parser = argparse.ArgumentParser(description="Create or reset the platform superadmin.")
    parser.add_argument(
        "--reset-password",
        action="store_true",
        help="Reset the existing superadmin's password to SUPERADMIN_PASSWORD from .env.",
    )
    args = parser.parse_args()

    email = settings.SUPERADMIN_EMAIL.strip().lower()
    password = settings.SUPERADMIN_PASSWORD

    if not email or not password:
        print("SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD must be set in the environment.", file=sys.stderr)
        sys.exit(1)

    if len(password) < 8:
        print("SUPERADMIN_PASSWORD must be at least 8 characters.", file=sys.stderr)
        sys.exit(1)

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.role == UserRole.superadmin).first()

        if existing is not None:
            if args.reset_password:
                existing.password_hash = hash_password(password)
                existing.must_change_password = False
                db.commit()
                print(f"Superadmin password reset for {existing.email}.")
            else:
                print(
                    f"Superadmin already exists ({existing.email}). No changes made. "
                    "Use --reset-password to set a new password from .env."
                )
            return

        if args.reset_password:
            print("No superadmin exists yet — run without --reset-password to create one.", file=sys.stderr)
            sys.exit(1)

        duplicate = db.query(User).filter(User.email == email).first()
        if duplicate is not None:
            print(f"Cannot create superadmin: email {email} is already in use.", file=sys.stderr)
            sys.exit(1)

        user = User(
            organization_id=None,
            email=email,
            password_hash=hash_password(password),
            full_name="Platform Superadmin",
            role=UserRole.superadmin,
            status=UserStatus.active,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Superadmin created: {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
