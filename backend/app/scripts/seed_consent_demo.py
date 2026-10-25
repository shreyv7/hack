"""Seed demo purposes and a published consent notice for the first active org."""

from __future__ import annotations
from datetime import datetime, timezone
from app.core.database import SessionLocal
from app.models.consent import (
    ConsentNotice,
    ConsentNoticeVersion,
    LegalBasis,
    NoticeVersionStatus,
    Purpose,
    PurposeVersion,
)
from app.models.organization import Organization, OrganizationStatus

def seed_consent_demo() -> None:
    db = SessionLocal()
    try:
        org = (
            db.query(Organization)
            .filter(Organization.status == OrganizationStatus.active)
            .order_by(Organization.created_at)
            .first()
        )
        if org is None:
            print("No active organization — skip consent seed")
            return

        existing = db.query(Purpose).filter(Purpose.organization_id == org.id).count()
        if existing > 0:
            print(f"Org {org.slug} already has purposes — skip seed")
            return

        now = datetime.now(timezone.utc)
        
        # Define purpose data
        purpose_data = [
            {
                "name": "Customer Order Fulfillment",
                "legal_basis": LegalBasis.legitimate_use,
                "data_categories": ["Name", "Address", "Phone", "Payment"],
                "retention_period": "7 years",
                "description": "Processing order data to fulfill purchases.",
            },
            {
                "name": "Marketing Email Campaigns",
                "legal_basis": LegalBasis.consent,
                "data_categories": ["Email", "Behavioral"],
                "retention_period": "Until withdrawal + 3y",
                "description": "Sending newsletters and marketing materials.",
            },
            {
                "name": "Loyalty Programme",
                "legal_basis": LegalBasis.consent,
                "data_categories": ["Name", "Email", "Purchase history"],
                "retention_period": "Until withdrawal",
                "description": "Managing points and loyalty discounts.",
            },
        ]
        
        purposes = []
        purpose_versions = []
        
        for data in purpose_data:
            purpose = Purpose(
                organization_id=org.id,
                name=data["name"],
            )
            db.add(purpose)
            db.flush()
            
            version = PurposeVersion(
                purpose_id=purpose.id,
                version_number=1,
                name=data["name"],
                legal_basis=data["legal_basis"],
                data_categories=data["data_categories"],
                retention_period=data["retention_period"],
                description=data["description"],
                last_reviewed_at=now,
                published_at=now,
            )
            db.add(version)
            db.flush()
            
            purpose.current_live_version_id = version.id
            purposes.append(purpose)
            purpose_versions.append(version)
            
        db.flush()

        notice = ConsentNotice(
            organization_id=org.id,
            internal_name="Customer Purchase",
        )
        db.add(notice)
        db.flush()

        version = ConsentNoticeVersion(
            notice_id=notice.id,
            version_number=1,
            status=NoticeVersionStatus.live,
            display_name="Customer Purchase Notice",
            language="English",
            opening_statement=(
                "We process your personal data to fulfil orders and provide related services "
                "as described below."
            ),
            contact_email="privacy@example.com",
            dpo_name="Data Protection Officer",
            dpo_email="dpo@example.com",
            rights_exercise=(
                "You may access, correct, or erase your data and withdraw consent at any time "
                "via our privacy portal or by emailing the DPO."
            ),
            complaint_process=(
                "You may lodge a complaint with the Data Protection Board of India."
            ),
            retention_policy="See linked purpose retention periods.",
            published_at=now,
            purposes=purpose_versions,
        )
        db.add(version)
        db.flush()
        notice.current_live_version_id = version.id
        db.commit()
        print(f"Seeded consent demo for org {org.slug}: {len(purposes)} purposes, 1 live notice")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed_consent_demo()
