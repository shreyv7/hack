"""Manual integration test for RoPA discovery suggestion lifecycle."""

from app.core.database import SessionLocal
from app.models.data_inventory import AssetStatus, AssetType, DataInventoryAsset, DataInventoryField
from app.models.data_inventory import FieldClassification
from app.models.data_source import DataSource, DataSourceStatus
from app.models.organization import Organization
from app.models.ropa import ProcessingActivity, RopaDiscoverySuggestion
from app.models.user import User
from app.services.ropa_discovery_service import RopaDiscoveryService


def _ensure_inventory_seed(db, org_id) -> None:
    """Create a minimal data source + PII asset if the org has no inventory."""
    existing = (
        db.query(DataInventoryAsset)
        .filter(DataInventoryAsset.organization_id == org_id)
        .first()
    )
    if existing:
        return

    source = DataSource(
        organization_id=org_id,
        name="Test Postgres",
        source_type="postgresql",
        category="database",
        status=DataSourceStatus.connected,
    )
    db.add(source)
    db.flush()

    asset = DataInventoryAsset(
        organization_id=org_id,
        data_source_id=source.id,
        name="customers",
        asset_type=AssetType.table,
        location="Test Postgres",
        data_categories=["email", "phone"],
        status=AssetStatus.active,
    )
    db.add(asset)
    db.flush()

    db.add(
        DataInventoryField(
            asset_id=asset.id,
            name="email",
            classification=FieldClassification.personal,
            pii_category="email",
        )
    )
    db.add(
        DataInventoryField(
            asset_id=asset.id,
            name="phone",
            classification=FieldClassification.personal,
            pii_category="phone",
        )
    )
    db.commit()


def test_suggestions_lifecycle():
    db = SessionLocal()
    try:
        org = db.query(Organization).first()
        if not org:
            print("No organization found; run seeds first.")
            return

        user = db.query(User).filter(User.organization_id == org.id).first()
        if not user:
            user = db.query(User).first()
        if not user:
            print("No user found.")
            return

        service = RopaDiscoveryService(db)

        db.query(RopaDiscoverySuggestion).filter(
            RopaDiscoverySuggestion.organization_id == org.id
        ).delete()
        db.commit()
        print("Cleaned up existing suggestions.")

        _ensure_inventory_seed(db, org.id)

        print("=== Suggestions Test 1: Scan (rule-based or Bedrock) ===")
        suggestions = service.scan_sources(user, org_id=org.id)
        print(f"Scanned successfully. Pending suggestions: {len(suggestions)}")
        assert len(suggestions) >= 1, "Expected at least one suggestion from inventory"

        print("=== Suggestions Test 2: List Pending Suggestions ===")
        pending = service.list_suggestions(user, org_id=org.id)
        print(f"Pending list count: {len(pending)}")
        assert len(pending) == len(suggestions)

        sug_to_accept = pending[0]
        print(
            f"Selecting suggestion to accept: Source='{sug_to_accept.source_name}', "
            f"Title='{sug_to_accept.suggested_title}'"
        )

        print("=== Suggestions Test 3: Accept Suggestion ===")
        activity = service.accept_suggestion(user, sug_to_accept.id)
        print(
            f"Created Activity: Ref={activity.activity_ref}, "
            f"Title='{activity.title}', Status='{activity.status}'"
        )
        assert activity.status == "draft"
        assert activity.title == sug_to_accept.suggested_title

        db.refresh(sug_to_accept)
        print(f"Accepted suggestion status: {sug_to_accept.status}")
        assert sug_to_accept.status == "accepted"

        pending_after_accept = service.list_suggestions(user, org_id=org.id)
        print(f"Pending list count after accept: {len(pending_after_accept)}")
        assert len(pending_after_accept) == len(pending) - 1

        if pending_after_accept:
            sug_to_dismiss = pending_after_accept[0]
            print(f"Selecting suggestion to dismiss: Title='{sug_to_dismiss.suggested_title}'")

            print("=== Suggestions Test 4: Dismiss Suggestion ===")
            dismissed = service.dismiss_suggestion(user, sug_to_dismiss.id)
            print(f"Dismissed suggestion status: {dismissed.status}")
            assert dismissed.status == "dismissed"

            pending_after_dismiss = service.list_suggestions(user, org_id=org.id)
            print(f"Pending list count after dismiss: {len(pending_after_dismiss)}")
            assert len(pending_after_dismiss) == len(pending_after_accept) - 1

        print("=== Cleanup Newly Created Activity ===")
        db.query(ProcessingActivity).filter(ProcessingActivity.id == activity.id).delete()
        db.commit()

        print("=== Suggestions Lifecycle Test Passed Successfully! ===")
    except Exception as e:
        print(f"Suggestions test failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    test_suggestions_lifecycle()
