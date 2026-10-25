"""Service for managing Integration Properties and API keys."""

import secrets
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.integration_api_key import IntegrationApiKey
from app.models.integration_property import IntegrationProperty, PropertyStatus
from app.models.property_banner_association import PropertyBannerAssociation
from app.models.user import User
from app.schemas.integration_property import IntegrationPropertyCreate, IntegrationPropertyUpdate
from app.services.contracts.banner_contract import BannerConfigContract
from app.services.consent_service import ConsentService
from app.core.security import hash_password


class PropertyService:
    def __init__(self, db: Session):
        self.db = db

    def _resolve_org_id(self, user: User, org_id: UUID | None = None) -> UUID:
        return ConsentService(self.db)._resolve_org_id(user, org_id)

    def list_properties(
        self,
        current_user: User,
        org_id: UUID | None = None,
    ) -> list[IntegrationProperty]:
        resolved_org_id = self._resolve_org_id(current_user, org_id)
        return (
            self.db.query(IntegrationProperty)
            .filter(
                IntegrationProperty.organization_id == resolved_org_id,
                IntegrationProperty.status != PropertyStatus.archived,
            )
            .all()
        )

    def get_property(
        self,
        current_user: User,
        property_id: UUID,
        org_id: UUID | None = None,
    ) -> IntegrationProperty:
        resolved_org_id = self._resolve_org_id(current_user, org_id)
        prop = self.db.query(IntegrationProperty).filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == resolved_org_id,
        ).first()

        if not prop:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Property not found"
            )
        return prop

    def create_property(
        self,
        current_user: User,
        data: IntegrationPropertyCreate,
        org_id: UUID | None = None,
    ) -> tuple[IntegrationProperty, str, str]:
        """Creates a property and its first API key. Returns (property, raw_key, key_prefix)."""
        resolved_org_id = self._resolve_org_id(current_user, org_id)
        # Check for duplicates
        existing = self.db.query(IntegrationProperty).filter(
            IntegrationProperty.organization_id == resolved_org_id,
            IntegrationProperty.domain == data.domain,
            IntegrationProperty.environment == data.environment,
        ).first()

        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Property '{data.domain}' already exists in {data.environment} environment."
            )

        status_val = data.status if hasattr(data, 'status') else PropertyStatus.pending_setup
        if status_val == PropertyStatus.active:
            if not data.consent_notice_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Active properties must have a consent notice attached."
                )
            from app.models.consent import ConsentNotice
            notice = self.db.get(ConsentNotice, data.consent_notice_id)
            if not notice or not notice.current_live_version_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The attached consent notice must be published before activating the property."
                )

        settings_dict = {}
        if data.settings:
            settings_dict = data.settings.model_dump()
        else:
            settings_dict = {
                "environment": data.environment.value if hasattr(data.environment, "value") else data.environment,
                "blocker_mode": data.blocker_mode.value if hasattr(data.blocker_mode, "value") else data.blocker_mode,
                "auto_language": True,
                "default_language": data.default_language,
                "geo_targeting": {},
                "allowed_origins": [],
                "advanced_metadata": {},
            }

        prop = IntegrationProperty(
            organization_id=resolved_org_id,
            domain=data.domain,
            display_name=data.display_name or data.domain,
            property_type=data.property_type,
            environment=data.environment,
            blocker_mode=data.blocker_mode,
            default_language=data.default_language,
            created_by=current_user.id,
            consent_notice_id=data.consent_notice_id,
            status=status_val,
            settings=settings_dict,
        )
        self.db.add(prop)
        self.db.flush()  # To get prop.id

        # Generate initial API key
        api_key = self._generate_api_key(prop.id, resolved_org_id, current_user_id=current_user.id)
        
        # Log property_created event
        self.log_property_event(prop.id, "property_created", {"created_by": str(current_user.id)})

        self.db.commit()
        self.db.refresh(prop)
        
        return prop, api_key["raw_key"], api_key["prefix"]

    def update_property(
        self, current_user: User, property_id: UUID, data: IntegrationPropertyUpdate, org_id: UUID | None = None
    ) -> IntegrationProperty:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        
        new_status = data.status if "status" in data.model_fields_set else prop.status
        new_notice_id = data.consent_notice_id if "consent_notice_id" in data.model_fields_set else prop.consent_notice_id
        
        if new_status == PropertyStatus.active:
            if not new_notice_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Active properties must have a consent notice attached."
                )
            from app.models.consent import ConsentNotice
            notice = self.db.get(ConsentNotice, new_notice_id)
            if not notice or not notice.current_live_version_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The attached consent notice must be published before activating the property."
                )
                
        update_data = data.model_dump(exclude_unset=True)
        
        # Sync Pydantic Settings Update
        if "settings" in data.model_fields_set and data.settings is not None:
            settings_dump = data.settings.model_dump()
            prop.settings = settings_dump
            # Sync to flat columns
            prop.environment = settings_dump.get("environment", prop.environment)
            prop.blocker_mode = settings_dump.get("blocker_mode", prop.blocker_mode)
            prop.default_language = settings_dump.get("default_language", prop.default_language)
            prop.auto_language = settings_dump.get("auto_language", prop.auto_language)
            prop.geo_targeting = settings_dump.get("geo_targeting", prop.geo_targeting)
            if "settings" in update_data:
                del update_data["settings"]

        # Sync direct flat fields updates to settings
        current_settings = dict(prop.settings or {})
        for field in ["environment", "blocker_mode", "default_language", "auto_language", "geo_targeting", "allowed_origins"]:
            if field in update_data:
                val = update_data[field]
                current_settings[field] = val.value if hasattr(val, "value") else val
                if field == "allowed_origins":
                    prop.allowed_origins = val
        prop.settings = current_settings

        for field, value in update_data.items():
            setattr(prop, field, value)
            
        # Log events
        self.log_property_event(prop.id, "property_updated", {"updated_by": str(current_user.id)})
        self.log_property_event(prop.id, "settings_updated", {"updated_by": str(current_user.id)})

        self.db.commit()
        self.db.refresh(prop)
        return prop

    def archive_property(self, current_user: User, property_id: UUID, org_id: UUID | None = None) -> None:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        prop.status = PropertyStatus.archived
        self.db.commit()

    # --- API Keys ---
    
    def _generate_api_key(self, property_id: UUID, org_id: UUID, label: str = "Default", current_user_id: UUID | None = None) -> dict:
        """Internal helper to generate a securely hashed API key."""
        raw_key = f"zsk_live_{secrets.token_urlsafe(18)}"
        key_prefix = raw_key[:13]  # e.g. "zsk_live_xxxx"
        key_hash = hash_password(raw_key)

        api_key_obj = IntegrationApiKey(
            property_id=property_id,
            organization_id=org_id,
            key_prefix=key_prefix,
            key_hash=key_hash,
            label=label,
            created_by=current_user_id,
        )
        self.db.add(api_key_obj)
        
        return {"raw_key": raw_key, "prefix": key_prefix, "obj": api_key_obj}

    def generate_new_api_key(self, current_user: User, property_id: UUID, label: str = "Default", org_id: UUID | None = None) -> dict:
        """User-facing API to generate a new key."""
        prop = self.get_property(current_user, property_id, org_id=org_id)
        resolved_org = self._resolve_org_id(current_user, org_id)
        result = self._generate_api_key(prop.id, resolved_org, label, current_user_id=current_user.id)
        
        # Log event
        self.log_property_event(prop.id, "api_key_rotated", {"rotated_by": str(current_user.id)})
        self.log_property_event(prop.id, "api_key_generated", {"generated_by": str(current_user.id)})
        
        self.db.commit()
        return result

    def revoke_api_key(self, current_user: User, property_id: UUID, key_id: UUID, org_id: UUID | None = None) -> None:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        
        key = self.db.query(IntegrationApiKey).filter(
            IntegrationApiKey.id == key_id,
            IntegrationApiKey.property_id == prop.id,
        ).first()
        
        if not key:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="API Key not found")
            
        key.status = "revoked"
        key.revoked_at = datetime.now(timezone.utc)
        
        # Log event
        self.log_property_event(prop.id, "api_key_revoked", {"key_id": str(key_id), "revoked_by": str(current_user.id)})
        
        self.db.commit()

    # --- Banner Association ---
    
    def get_active_banner(self, current_user: User, property_id: UUID, org_id: UUID | None = None) -> PropertyBannerAssociation | None:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        return self.db.query(PropertyBannerAssociation).filter(
            PropertyBannerAssociation.property_id == prop.id,
            PropertyBannerAssociation.status == "active"
        ).first()

    def set_active_banner(self, current_user: User, property_id: UUID, banner_id: UUID, org_id: UUID | None = None) -> PropertyBannerAssociation:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        
        if not BannerConfigContract.validate_banner_exists(self.db, banner_id):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Invalid banner ID")

        # Deactivate current active banner (if any)
        current = self.get_active_banner(current_user, property_id, org_id=org_id)
        if current:
            if current.banner_id == banner_id:
                return current  # already active
            current.status = "inactive"
            current.deactivated_at = datetime.now(timezone.utc)

        # Create new association
        resolved_org = self._resolve_org_id(current_user, org_id)
        new_assoc = PropertyBannerAssociation(
            property_id=prop.id,
            organization_id=resolved_org,
            banner_id=banner_id,
            status="active",
            activated_by=current_user.id,
        )
        self.db.add(new_assoc)
        
        # Log event
        self.log_property_event(prop.id, "banner_changed", {"banner_id": str(banner_id), "deployed_by": str(current_user.id)})

        self.db.commit()
        self.db.refresh(new_assoc)

        # Log activity
        try:
            from app.services.banner_service import BannerService
            banner_svc = BannerService(self.db)
            banner = banner_svc.get_banner(current_user, banner_id, org_id=resolved_org)
            banner_svc.log_activity(
                current_user,
                banner,
                f"Deployed to {prop.domain}",
                deployed_on=[{"type": "website", "label": prop.domain}]
            )
        except Exception as e:
            print(f"Failed to log deploy activity: {e}")

        return new_assoc

    # --- Helpers ---

    def log_property_event(self, property_id: UUID, event_type: str, payload: dict = {}) -> None:
        from app.models.integration_event import IntegrationEvent
        event = IntegrationEvent(
            property_id=property_id,
            event_type=event_type,
            payload=payload,
            created_at=datetime.now(timezone.utc)
        )
        self.db.add(event)
        self.db.commit()

    def calculate_property_health(self, property_id: UUID) -> tuple[int, str]:
        score = 0
        
        # 1. Verification (30%)
        from app.models.property_verification import PropertyVerification
        latest_verification = self.db.query(PropertyVerification).filter(
            PropertyVerification.property_id == property_id
        ).order_by(PropertyVerification.checked_at.desc()).first()
        
        if latest_verification:
            if latest_verification.all_passed:
                score += 30
            else:
                passed_checks = sum([
                    1 if latest_verification.snippet_detected else 0,
                    1 if latest_verification.correct_property_id else 0,
                    1 if latest_verification.banner_rendered else 0,
                    1 if latest_verification.ssl_valid else 0,
                    1 if latest_verification.loaded_before_trackers else 0,
                ])
                score += int((passed_checks / 5.0) * 30)
        
        # 2. Coverage (25%)
        from app.models.page_coverage_scan import PageCoverageScan
        latest_scan = self.db.query(PageCoverageScan).filter(
            PageCoverageScan.property_id == property_id
        ).order_by(PageCoverageScan.started_at.desc()).first()
        
        if latest_scan:
            score += int((latest_scan.coverage_percentage / 100.0) * 25)
        else:
            score += 0
            
        # 3. Banner Linked (20%)
        active_banner = self.db.query(PropertyBannerAssociation).filter(
            PropertyBannerAssociation.property_id == property_id,
            PropertyBannerAssociation.status == "active"
        ).first()
        if active_banner:
            score += 20
            
        # 4. Analytics Health / Events (15%)
        from app.models.tag_manager import TagViolation
        unresolved_violations = self.db.query(TagViolation).filter(
            TagViolation.property_id == property_id,
            TagViolation.resolved == False
        ).count()
        violation_penalty = min(15, unresolved_violations * 3)
        score += (15 - violation_penalty)
        
        # 5. Deployment Status (10%)
        prop = self.db.query(IntegrationProperty).filter(IntegrationProperty.id == property_id).first()
        if prop:
            if prop.status == PropertyStatus.active:
                score += 10
            elif prop.status == PropertyStatus.pending_setup:
                score += 2
            elif prop.status == PropertyStatus.paused:
                score += 5
                
        # Determine Grade
        if score >= 95:
            grade = "Excellent"
        elif score >= 80:
            grade = "Good"
        elif score >= 60:
            grade = "Needs Attention"
        else:
            grade = "Critical"
            
        return score, grade

    def get_delete_impact(self, current_user: User, property_id: UUID, org_id: UUID | None = None) -> dict:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        
        from app.models.property_banner_association import PropertyBannerAssociation
        from app.models.tag_manager import TagManagerContainer
        from app.models.page_coverage_scan import PageCoverageScan
        from app.models.detected_tracker import DetectedTracker
        from app.models.integration_api_key import IntegrationApiKey
        from app.models.consent_receipt import ConsentReceipt
        
        active_banners = self.db.query(PropertyBannerAssociation).filter(
            PropertyBannerAssociation.property_id == property_id,
            PropertyBannerAssociation.status == "active"
        ).count()
        
        containers = self.db.query(TagManagerContainer).filter(
            TagManagerContainer.property_id == property_id
        ).count()
        
        scanned_pages = self.db.query(PageCoverageScan).filter(
            PageCoverageScan.property_id == property_id
        ).count()
        
        cookies_scanned = self.db.query(DetectedTracker).filter(
            DetectedTracker.property_id == property_id
        ).count()
        
        api_keys = self.db.query(IntegrationApiKey).filter(
            IntegrationApiKey.property_id == property_id
        ).count()
        
        consent_receipts = self.db.query(ConsentReceipt).filter(
            ConsentReceipt.property_id == property_id
        ).count()
        
        has_relations = (
            active_banners > 0
            or containers > 0
            or scanned_pages > 0
            or cookies_scanned > 0
            or api_keys > 0
        )
        
        return {
            "property_name": prop.display_name or prop.domain,
            "active_banners_count": active_banners,
            "containers_count": containers,
            "scanned_pages_count": scanned_pages,
            "cookies_scanned_count": cookies_scanned,
            "api_keys_count": api_keys,
            "consent_receipts_count": consent_receipts,
            "has_relations": has_relations
        }

    def delete_property(self, current_user: User, property_id: UUID, org_id: UUID | None = None) -> None:
        prop = self.get_property(current_user, property_id, org_id=org_id)
        self.log_property_event(prop.id, "property_deleted", {"deleted_by": str(current_user.id)})
        self.db.delete(prop)
        self.db.commit()
