"""Service for triggering and managing property verification checks."""

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.integration_property import IntegrationProperty
from app.models.property_verification import PropertyVerification
from app.models.user import User


class VerificationService:
    def __init__(self, db: Session):
        self.db = db

    def get_latest_verification(self, property_id: UUID) -> PropertyVerification | None:
        return (
            self.db.query(PropertyVerification)
            .filter(PropertyVerification.property_id == property_id)
            .order_by(PropertyVerification.checked_at.desc())
            .first()
        )

    def list_verifications(self, property_id: UUID, limit: int = 10) -> list[PropertyVerification]:
        return (
            self.db.query(PropertyVerification)
            .filter(PropertyVerification.property_id == property_id)
            .order_by(PropertyVerification.checked_at.desc())
            .limit(limit)
            .all()
        )

    async def trigger_verification(self, current_user: User, property_id: UUID) -> PropertyVerification:
        """
        Triggers a manual verification check using Playwright headless browser.
        """
        from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError
        from app.models.integration_property import PropertyStatus

        prop = self.db.query(IntegrationProperty).filter(
            IntegrationProperty.id == property_id,
            IntegrationProperty.organization_id == current_user.organization_id,
        ).first()

        if not prop:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Property not found")

        # Log verification_started event
        from app.models.integration_event import IntegrationEvent
        start_event = IntegrationEvent(
            property_id=prop.id,
            event_type="verification_started",
            payload={"checked_by": str(current_user.id)},
            created_at=datetime.now(timezone.utc)
        )
        self.db.add(start_event)
        self.db.flush()

        # Fallback URL if domain isn't fully qualified
        url = f"https://{prop.domain}" if not prop.domain.startswith("http") else prop.domain
        if "localhost" in prop.domain or "127.0.0.1" in prop.domain:
            url = f"http://{prop.domain}" if not prop.domain.startswith("http") else prop.domain

        snippet_detected = False
        banner_rendered = False
        correct_property_id = False
        errors = []
        http_status = None
        
        start_time = datetime.now()

        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                page = await browser.new_page()
                
                try:
                    response = await page.goto(url, wait_until="networkidle", timeout=15000)
                    http_status = response.status if response else None
                    
                    if response and response.ok:
                        # 1. Check if CMP script tag exists
                        scripts = await page.locator("script").evaluate_all(
                            "elements => elements.map(e => e.src || e.innerHTML)"
                        )
                        snippet_detected = any("cmp.js" in s or "window.ZeroShield" in s for s in scripts)
                        
                        # 2. Check if ZeroShield is initialized
                        zs_state = await page.evaluate("() => window.ZeroShield ? { propertyId: window.ZeroShield.propertyId, initialized: window.ZeroShield.state.initialized } : null")
                        
                        if zs_state:
                            if zs_state.get("propertyId") == str(prop.id):
                                correct_property_id = True
                            else:
                                errors.append(f"Property ID mismatch. Found: {zs_state.get('propertyId')}")
                        
                        # 3. Check if banner is rendered
                        banner_count = await page.locator("zeroshield-consent-banner").count()
                        if banner_count > 0:
                            banner_rendered = True
                            
                    else:
                        errors.append(f"HTTP Error: {http_status}")
                        
                except PlaywrightTimeoutError:
                    errors.append("Page load timed out after 15s")
                except Exception as e:
                    errors.append(f"Page error: {str(e)}")
                    
                finally:
                    await browser.close()
                    
        except Exception as e:
            errors.append(f"Browser launch failed: {str(e)}")

        response_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        all_passed = snippet_detected and correct_property_id
        
        verification = PropertyVerification(
            property_id=prop.id,
            snippet_detected=snippet_detected,
            banner_rendered=banner_rendered,
            loaded_before_trackers=True, # Hardcoded for now
            ssl_valid=url.startswith("https"),
            correct_property_id=correct_property_id,
            all_passed=all_passed,
            http_status_code=http_status,
            response_time_ms=response_time_ms,
            detected_trackers=[],
            errors=errors,
            check_type="manual",
            checked_at=datetime.now(timezone.utc),
            checked_by=current_user.id,
        )

        self.db.add(verification)
        
        # Log event
        event_type = "verification_completed"
        event = IntegrationEvent(
            property_id=prop.id,
            event_type=event_type,
            payload={"checked_by": str(current_user.id), "errors": errors, "all_passed": all_passed, "duration_ms": response_time_ms},
            created_at=datetime.now(timezone.utc)
        )
        self.db.add(event)
        
        # If it passes, ensure property is marked active, otherwise mark verification_failed
        if verification.all_passed:
            if prop.status in [PropertyStatus.pending_setup, PropertyStatus.verification_failed]:
                prop.status = PropertyStatus.active
        else:
            if prop.status in [PropertyStatus.active, PropertyStatus.pending_setup]:
                prop.status = PropertyStatus.verification_failed
            
        self.db.commit()
        self.db.refresh(verification)
        return verification
