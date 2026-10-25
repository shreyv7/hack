from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from fastapi import HTTPException, status, BackgroundTasks
from app.models.user import User
from app.models.cookie_scan_job import CookieScanJob, ScanStatus
from app.models.detected_tracker import DetectedTracker
from app.models.tracker_override import TrackerOverride, TrackerAction
from app.services.property_service import PropertyService
from app.schemas.cookie_tracker import TrackerOverrideUpdate
from app.services.cookie_crawler import run_cookie_scan


class TrackerService:
    def __init__(self, db: Session):
        self.db = db
        self.property_service = PropertyService(db)

    def trigger_scan(self, current_user: User, property_id: UUID, background_tasks: BackgroundTasks) -> CookieScanJob:
        prop = self.property_service.get_property(current_user, property_id)

        # Create job
        job = CookieScanJob(
            property_id=prop.id,
            status=ScanStatus.pending
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)

        # Dispatch background task
        background_tasks.add_task(run_cookie_scan, str(job.id), str(prop.id), prop.domain)

        return job

    def get_latest_scan(self, current_user: User, property_id: UUID) -> CookieScanJob | None:
        prop = self.property_service.get_property(current_user, property_id)
        stmt = select(CookieScanJob).where(CookieScanJob.property_id == prop.id).order_by(desc(CookieScanJob.created_at))
        result = self.db.execute(stmt)
        return result.scalars().first()

    def list_trackers(self, current_user: User, property_id: UUID) -> list[dict]:
        prop = self.property_service.get_property(current_user, property_id)

        # Get all trackers for property
        stmt = select(DetectedTracker).where(DetectedTracker.property_id == prop.id)
        trackers = self.db.execute(stmt).scalars().all()

        # Get all overrides for property
        stmt_overrides = select(TrackerOverride).where(TrackerOverride.property_id == prop.id)
        overrides = {o.tracker_name: o for o in self.db.execute(stmt_overrides).scalars().all()}

        results = []
        for t in trackers:
            t_dict = {
                "id": t.id,
                "property_id": t.property_id,
                "name": t.name,
                "type": t.type,
                "category": t.category,
                "domain": t.domain,
                "path": t.path,
                "expiry": t.expiry,
                "description": t.description,
                "first_detected_at": t.first_detected_at,
                "last_seen_at": t.last_seen_at,
                "status": t.status,
                "scan_job_id": t.scan_job_id,
                "purpose_id": t.purpose_id,
                # Additional fields based on override
                "override_action": "auto",
                "active_category": t.category,
                "active_purpose_id": t.purpose_id
            }
            if t.name in overrides:
                override = overrides[t.name]
                t_dict["override_action"] = override.action
                if override.overridden_category:
                    t_dict["active_category"] = override.overridden_category
                if override.purpose_id:
                    t_dict["active_purpose_id"] = override.purpose_id

            results.append(t_dict)
            
        return results

    def update_tracker(self, current_user: User, property_id: UUID, tracker_id: UUID, data: TrackerOverrideUpdate):
        prop = self.property_service.get_property(current_user, property_id)

        tracker = self.db.get(DetectedTracker, tracker_id)
        if not tracker or tracker.property_id != prop.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tracker not found")

        # Find or create override
        stmt = select(TrackerOverride).where(
            TrackerOverride.property_id == prop.id,
            TrackerOverride.tracker_name == tracker.name
        )
        override = self.db.execute(stmt).scalar_one_or_none()

        if not override:
            override = TrackerOverride(
                property_id=prop.id,
                tracker_name=tracker.name
            )
            self.db.add(override)
            
        override.overridden_category = data.overridden_category
        override.action = data.action
        override.purpose_id = data.purpose_id

        self.db.commit()

        # Re-fetch trackers with overrides applied
        # Just return success, we'll let frontend refresh
        return {"status": "success"}

    def get_blocking_rules(self, property_id: UUID) -> dict[str, list[str]]:
        # Get property
        from app.models.integration_property import IntegrationProperty
        prop = self.db.get(IntegrationProperty, property_id)
        if not prop:
            return {}
            
        # Get active purposes for this property if a notice is linked
        active_purpose_ids = set()
        active_purposes = []
        if prop.consent_notice_id:
            from app.models.consent import ConsentNotice, ConsentNoticeVersion
            notice = self.db.get(ConsentNotice, prop.consent_notice_id)
            if notice and notice.current_live_version_id:
                live_version = self.db.get(ConsentNoticeVersion, notice.current_live_version_id)
                if live_version:
                    active_purposes = live_version.purposes
                    active_purpose_ids = {p.id for p in active_purposes}

        # Get all trackers for property
        stmt = select(DetectedTracker).where(DetectedTracker.property_id == property_id)
        trackers = self.db.execute(stmt).scalars().all()

        # Get all overrides for property
        stmt_overrides = select(TrackerOverride).where(TrackerOverride.property_id == property_id)
        overrides = {o.tracker_name: o for o in self.db.execute(stmt_overrides).scalars().all()}

        rules = {}

        for t in trackers:
            active_cat = t.category
            active_purpose_id = t.purpose_id
            override_action = "auto"
            
            if t.name in overrides:
                override = overrides[t.name]
                override_action = override.action
                if override.overridden_category:
                    active_cat = override.overridden_category
                if override.purpose_id:
                    active_purpose_id = override.purpose_id

            if override_action == "allow":
                # Explicit allow, SDK should ignore blocking.
                continue

            # --- Purpose Versioning Resolution ---
            if active_purpose_ids:
                if active_purpose_id and active_purpose_id in active_purpose_ids:
                    # Case 1: Tracker is mapped to an active purpose in the live notice.
                    pass
                else:
                    # Case 2: Tracker is mapped to an inactive purpose or has no purpose.
                    # Try to map on the fly to one of the active purposes using category keywords.
                    resolved_id = None
                    keywords = {
                        "analytics": ["analytics", "tracking", "measure", "traffic", "visitor"],
                        "marketing": ["marketing", "ads", "advertis", "campaign", "promo", "pixel"],
                        "functional": ["functional", "chat", "support", "preference", "widget"],
                        "essential": ["essential", "core", "session", "security", "csrf"]
                    }
                    cat_str = active_cat.value if hasattr(active_cat, 'value') else str(active_cat)
                    cat_keywords = keywords.get(cat_str, [])
                    for purpose in active_purposes:
                        name_lower = purpose.name.lower()
                        if any(kw in name_lower for kw in cat_keywords):
                            resolved_id = purpose.id
                            break
                            
                    if resolved_id:
                        active_purpose_id = resolved_id
                    else:
                        # Case 3: No keywords matched. Fall back to the first non-essential active purpose.
                        from app.models.consent import LegalBasis
                        non_essential_purposes = [
                            p for p in active_purposes 
                            if p.legal_basis != LegalBasis.legitimate_use
                        ]
                        if non_essential_purposes:
                            active_purpose_id = non_essential_purposes[0].id
                        elif active_purposes:
                            active_purpose_id = active_purposes[0].id
                        else:
                            active_purpose_id = None

            # Map by purpose_id if it exists, otherwise fall back to category name
            key = str(active_purpose_id) if active_purpose_id else active_cat
            if key not in rules:
                rules[key] = []
            rules[key].append(t.name)
                    
        return rules
