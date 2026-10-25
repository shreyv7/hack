import sys
from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.organization import Organization
from app.models.integration_property import IntegrationProperty
from app.models.detected_tracker import DetectedTracker, TrackerType, TrackerCategory
from app.models.tracker_override import TrackerOverride
from app.models.consent import Purpose, ConsentNotice, ConsentNoticeVersion, LegalBasis, NoticeVersionStatus
from app.services.tracker_service import TrackerService
from app.services.consent_service import ConsentService
from app.models.user import User, UserRole
from app.services.cookie_crawler import auto_map_purpose_for_tracker
from app.schemas.cookie_tracker import TrackerOverrideUpdate

def test_wiring():
    print("=== Testing Cookies and Consent Dynamic Wiring ===")
    db = SessionLocal()
    try:
        # 1. Fetch sandbox org and test admin
        org = db.query(Organization).filter(Organization.slug == "zeroshield-sandbox-org").first()
        assert org is not None, "Sandbox org not found"
        
        admin = db.query(User).filter(User.role == UserRole.admin).first()
        assert admin is not None, "Test admin not found"
        
        # Cleanup any previous test data
        db.query(DetectedTracker).filter(DetectedTracker.domain == "wiring-test.com").delete()
        db.query(IntegrationProperty).filter(IntegrationProperty.domain == "wiring-test.com").delete()
        db.query(Purpose).filter(Purpose.name.like("%Wiring Test%")).delete()
        db.query(ConsentNotice).filter(ConsentNotice.internal_name.like("%Wiring Test%")).delete()
        db.commit()

        # 2. Create dynamic purposes
        from app.schemas.consent import PurposeCreate, NoticeCreate
        consent_service = ConsentService(db)
        p_analytics = consent_service.create_purpose(
            admin,
            PurposeCreate(
                name="Wiring Test Analytics Purpose",
                legal_basis=LegalBasis.consent,
                data_categories=["IP Address", "User Behavior"],
                retention_period="1 year"
            )
        )
        print(f"Created Purpose: {p_analytics.name} ({p_analytics.id})")

        p_marketing = consent_service.create_purpose(
            admin,
            PurposeCreate(
                name="Wiring Test Marketing Campaigns",
                legal_basis=LegalBasis.consent,
                data_categories=["Email"],
                retention_period="3 years"
            )
        )
        print(f"Created Purpose: {p_marketing.name} ({p_marketing.id})")

        # 3. Create a notice and publish it
        notice_detail = consent_service.create_notice(
            admin,
            NoticeCreate(
                internal_name="Wiring Test Notice",
                display_name="Wiring Test Consent Policy",
                contact_email="contact@wiring-test.com",
                dpo_email="dpo@wiring-test.com"
            )
        )
        notice_id = notice_detail.id
        version_id = notice_detail.versions[0].id
        
        # Link purposes to version
        consent_service.set_version_purposes(
            admin, notice_id, version_id, 
            body=NoticeVersionPurposesUpdate(purpose_ids=[p_analytics.id, p_marketing.id])
        )
        
        # Autocomplete compliance defaults
        consent_service.run_compliance_check(admin, notice_id, version_id, auto_fix=True)
        
        # Publish
        consent_service.publish_version(admin, notice_id, version_id)
        print("Consent notice published successfully.")

        # 4. Create Property and link it to the Notice
        prop = IntegrationProperty(
            organization_id=org.id,
            domain="wiring-test.com",
            display_name="Wiring Test Site",
            consent_notice_id=notice_id
        )
        db.add(prop)
        db.commit()
        db.refresh(prop)
        print(f"Created Property linked to Notice: {prop.domain} -> {prop.consent_notice_id}")
        assert prop.consent_notice_id == notice_id

        # 5. Verify Auto-Mapping Engine
        # Scanned analytics tracker '_ga' should map automatically to p_analytics because of keywords
        ga_purpose_id = db.scalar(
            select(Purpose.id).where(Purpose.id == p_analytics.id)
        )
        auto_mapped_id = db.scalar(
            select(Purpose.id).where(Purpose.id == p_analytics.id)
        )
        
        # Let's test the helper function directly
        mapped_purpose = auto_map_purpose_for_tracker(db, str(prop.id), TrackerCategory.analytics)
        # It runs an async block, but wait, test is sync, so we can run an async generator or just execute
        # Wait, since the test runs in a sync script, let's run it using asyncio if we need to.
        mapped_purpose_id = auto_map_purpose_for_tracker(db, str(prop.id), TrackerCategory.analytics)
        print(f"Auto-mapping result for category analytics: {mapped_purpose_id}")
        assert mapped_purpose_id == p_analytics.id, "Auto-mapping engine failed to match analytics keyword"

        # Create detected tracker with auto-mapped purpose
        tracker = DetectedTracker(
            property_id=prop.id,
            name="_ga",
            type=TrackerType.cookie,
            category=TrackerCategory.analytics,
            domain="wiring-test.com",
            path="/",
            expiry="2 years",
            description="Google Analytics",
            first_detected_at=datetime.now(timezone.utc),
            last_seen_at=datetime.now(timezone.utc),
            purpose_id=mapped_purpose_id
        )
        db.add(tracker)
        db.commit()

        # 6. Override the Tracker mapping to another purpose
        tracker_service = TrackerService(db)
        tracker_service.update_tracker(
            admin, prop.id, tracker.id,
            TrackerOverrideUpdate(
                action="block",
                purpose_id=p_marketing.id
            )
        )
        
        # Verify override is saved in TrackerOverride
        override = db.query(TrackerOverride).filter(
            TrackerOverride.property_id == prop.id,
            TrackerOverride.tracker_name == tracker.name
        ).first()
        assert override is not None
        assert override.purpose_id == p_marketing.id
        print(f"Explicit override applied: mapped tracker '_ga' to Purpose {p_marketing.name}")

        # 7. Check get_blocking_rules mapping output
        blocking_rules = tracker_service.get_blocking_rules(prop.id)
        print(f"Blocking rules generated: {blocking_rules}")
        assert str(p_marketing.id) in blocking_rules
        assert "_ga" in blocking_rules[str(p_marketing.id)]

        # 8. Check Property-Level Default Notice Enforcement
        from app.services.property_service import PropertyService
        property_service = PropertyService(db)
        from app.schemas.integration_property import IntegrationPropertyCreate, IntegrationPropertyUpdate
        from app.models.integration_property import PropertyStatus, PropertyEnvironment, BlockerMode
        
        # Set property status to pending_setup to change notice
        prop.status = PropertyStatus.pending_setup
        db.commit()
        
        # Try updating property to active without notice_id
        try:
            property_service.update_property(
                admin, prop.id,
                IntegrationPropertyUpdate(status=PropertyStatus.active, consent_notice_id=None)
            )
            print("FAIL: Activated property without consent notice.")
            sys.exit(1)
        except Exception as exc:
            assert "must have a consent notice attached" in str(exc)
            print("OK: Property-Level Enforcement blocks activation without notice.")
            
        # Try updating property to active with unpublished notice
        unpublished_notice_detail = consent_service.create_notice(
            admin,
            NoticeCreate(
                internal_name="Wiring Test Unpublished Notice",
                display_name="Wiring Test Unpublished",
                contact_email="test@test.com"
            )
        )
        try:
            property_service.update_property(
                admin, prop.id,
                IntegrationPropertyUpdate(status=PropertyStatus.active, consent_notice_id=unpublished_notice_detail.id)
            )
            print("FAIL: Activated property with unpublished notice.")
            sys.exit(1)
        except Exception as exc:
            assert "must be published before activating" in str(exc)
            print("OK: Property-Level Enforcement blocks activation with unpublished notice.")

        # Set property back to active with published notice
        property_service.update_property(
            admin, prop.id,
            IntegrationPropertyUpdate(status=PropertyStatus.active, consent_notice_id=notice_id)
        )
        print("OK: Active status allowed with published notice.")

        # 9. Check Notice Archiving Protection
        try:
            consent_service.archive_notice(admin, notice_id)
            print("FAIL: Archived notice linked to active properties.")
            sys.exit(1)
        except Exception as exc:
            assert "linked to active properties" in str(exc)
            print("OK: Notice Archiving Protection blocked archiving successfully.")

        # 10. Check Consent Notice Publication Validation (Unmapped Trackers Warning)
        # Add an unmapped tracker (non-essential, e.g. marketing) on the property
        unmapped_tracker = DetectedTracker(
            property_id=prop.id,
            name="_fbp",
            type=TrackerType.cookie,
            category=TrackerCategory.marketing,
            domain="wiring-test.com",
            path="/",
            expiry="2 years",
            description="Facebook Pixel",
            first_detected_at=datetime.now(timezone.utc),
            last_seen_at=datetime.now(timezone.utc),
            purpose_id=None # explicitly unmapped
        )
        db.add(unmapped_tracker)
        db.commit()
        
        # Create draft from live to edit notice version
        draft_version = consent_service.create_draft_from_live(admin, notice_id)
        
        # Running compliance check should now return the UNMAPPED_TRACKERS warning!
        check_result = consent_service.run_compliance_check(admin, notice_id, draft_version.id)
        warnings_codes = [w.code for w in check_result.warnings]
        print(f"Compliance warnings for draft version: {warnings_codes}")
        assert "UNMAPPED_TRACKERS" in warnings_codes
        print("OK: Consent Notice Publication Validation triggered UNMAPPED_TRACKERS warning.")
        
        # Trying to publish the version should fail
        try:
            consent_service.publish_version(admin, notice_id, draft_version.id)
            print("FAIL: Published notice with unmapped trackers.")
            sys.exit(1)
        except Exception as exc:
            assert "warnings" in str(exc)
            print("OK: Prevented publishing notice with unmapped trackers.")

        # Clean up the unmapped tracker
        db.delete(unmapped_tracker)
        db.commit()

        # 11. Check Purpose Versioning Resolution
        # Ga tracker is mapped to p_marketing.id (Notice v1).
        # We publish Notice v2 containing ONLY p_analytics.id (Notice v2 doesn't have p_marketing.id).
        # First, set version purposes to only analytics
        consent_service.set_version_purposes(
            admin, notice_id, draft_version.id, 
            body=NoticeVersionPurposesUpdate(purpose_ids=[p_analytics.id])
        )
        consent_service.run_compliance_check(admin, notice_id, draft_version.id, auto_fix=True)
        
        # Deactivate property temporarily to bypass active properties mapping checks during publish
        prop.status = PropertyStatus.pending_setup
        db.commit()
        
        consent_service.publish_version(admin, notice_id, draft_version.id)
        print("Notice version 2 published (only contains Analytics purpose).")
        
        # Reactivate property to active
        prop.status = PropertyStatus.active
        db.commit()
        
        # Check get_blocking_rules mapping output:
        # '_ga' is mapped to p_marketing.id (which is not in Notice v2).
        # It should resolve on the fly to p_analytics.id because of category keywords fallback!
        blocking_rules_v2 = tracker_service.get_blocking_rules(prop.id)
        print(f"Blocking rules after Notice v2 publish: {blocking_rules_v2}")
        assert str(p_marketing.id) not in blocking_rules_v2
        assert str(p_analytics.id) in blocking_rules_v2
        assert "_ga" in blocking_rules_v2[str(p_analytics.id)]
        print("OK: Purpose Versioning Resolution successfully mapped tracker on-the-fly.")

        # 12. Check Purpose Deletion Protection
        # Set property status back to pending_setup and archive the notice so we can archive purposes
        prop.status = PropertyStatus.pending_setup
        db.commit()
        consent_service.archive_notice(admin, notice_id)
        
        try:
            consent_service.archive_purpose(admin, p_marketing.id)
            print("FAIL: Archiving mapped purpose did not raise conflict exception.")
            sys.exit(1)
        except Exception as exc:
            assert "actively mapped" in str(exc)
            print("OK: Purpose Deletion Protection verified successfully.")

        # Cleanup
        db.query(TrackerOverride).filter(TrackerOverride.property_id == prop.id).delete()
        db.query(DetectedTracker).filter(DetectedTracker.domain == "wiring-test.com").delete()
        db.query(IntegrationProperty).filter(IntegrationProperty.domain == "wiring-test.com").delete()
        db.query(Purpose).filter(Purpose.name.like("%Wiring Test%")).delete()
        db.query(ConsentNotice).filter(ConsentNotice.internal_name.like("%Wiring Test%")).delete()
        db.commit()
        print("Cleanup complete. All tests passed successfully!")

    finally:
        db.close()

# Pydantic schemas needed in script context
from app.schemas.consent import NoticeVersionPurposesUpdate

if __name__ == "__main__":
    test_wiring()
