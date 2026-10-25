"""Seed enterprise org hierarchy and RoPA data for testing."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from app.core.database import SessionLocal
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User
from app.models.ropa import (
    BusinessUnit,
    Department,
    Team,
    ProcessingActivity,
    ActivityVersion,
    ActivityOwner,
    ActivityPurpose,
    ActivityDataCategory,
    ActivityDataPrincipal,
    ActivityLawfulBasis,
    ActivitySystem,
    ActivityRecipient,
    ActivityCrossBorderTransfer,
    ActivityRetentionPolicy,
    ActivitySecurityMeasure,
)
from app.models.consent import Purpose


def seed_ropa() -> None:
    db = SessionLocal()
    try:
        org = (
            db.query(Organization)
            .filter(Organization.status == OrganizationStatus.active)
            .order_by(Organization.created_at)
            .first()
        )
        if org is None:
            print("No active organization — skip RoPA seed")
            return

        # Check if already seeded
        existing_bu = db.query(BusinessUnit).filter(BusinessUnit.organization_id == org.id).count()
        if existing_bu > 0:
            print(f"Org {org.slug} already has Business Units — skip RoPA seed")
            return

        user = db.query(User).filter(User.organization_id == org.id).first()
        if user is None:
            # Fallback to superadmin or any user
            user = db.query(User).first()
        
        user_id = user.id if user else None
        now = datetime.now(timezone.utc)

        # 1. Seed Business Units
        tech_bu = BusinessUnit(
            organization_id=org.id,
            name="Technology",
            code="TECH",
            head_user_id=user_id,
        )
        ops_bu = BusinessUnit(
            organization_id=org.id,
            name="Operations",
            code="OPS",
            head_user_id=user_id,
        )
        db.add(tech_bu)
        db.add(ops_bu)
        db.flush()

        # 2. Seed Departments
        eng_dept = Department(
            business_unit_id=tech_bu.id,
            organization_id=org.id,
            name="Engineering",
            code="ENG",
            head_user_id=user_id,
        )
        data_dept = Department(
            business_unit_id=tech_bu.id,
            organization_id=org.id,
            name="Data Platform",
            code="DATA",
            head_user_id=user_id,
        )
        logistics_dept = Department(
            business_unit_id=ops_bu.id,
            organization_id=org.id,
            name="Logistics & Supply Chain",
            code="LOG",
            head_user_id=user_id,
        )
        db.add(eng_dept)
        db.add(data_dept)
        db.add(logistics_dept)
        db.flush()

        # 3. Seed Teams
        plat_team = Team(
            department_id=eng_dept.id,
            organization_id=org.id,
            name="Platform Engineering",
            code="PLAT",
            head_user_id=user_id,
        )
        ux_team = Team(
            department_id=eng_dept.id,
            organization_id=org.id,
            name="User Experience",
            code="UX",
            head_user_id=user_id,
        )
        analytics_team = Team(
            department_id=data_dept.id,
            organization_id=org.id,
            name="Analytics & Business Intelligence",
            code="ANALYTICS",
            head_user_id=user_id,
        )
        db.add(plat_team)
        db.add(ux_team)
        db.add(analytics_team)
        db.flush()

        db.commit()
        print("Seeded RoPA corporate hierarchy successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding RoPA: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_ropa()
