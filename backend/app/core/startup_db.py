import os
import time
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.organization import Organization, OrganizationStatus
from app.models.user import User, UserRole, UserStatus
from app.core.security import hash_password
from app.utils.workspace_defaults import create_default_organization_settings

def run_migrations():
    print("Checking for pending database migrations...")
    try:
        from alembic.config import Config
        from alembic import command
        from app.core.database import engine

        # Release pooled connections so Alembic can acquire migration locks.
        engine.dispose()

        # Load Alembic config from alembic.ini
        alembic_cfg = Config("alembic.ini")
        # Apply every branch head (repo may have multiple parallel heads).
        command.upgrade(alembic_cfg, "heads")
        print("Database migrations applied successfully to head version.")
    except Exception as e:
        print(f"ERROR: Database migrations failed: {e}")
        if settings.ENVIRONMENT == "development":
            raise
        print("Warning: continuing startup without applying migrations.")

def seed_banners_and_containers(db: Session, org: Organization):
    try:
        from app.models.integration_property import IntegrationProperty, PropertyStatus, PropertyType, PropertyEnvironment, BlockerMode
        from app.models.consent_banner import ConsentBanner
        from app.models.tag_manager import TagManagerContainer, ManagedTag
        from app.models.consent import Purpose
        
        # 1. Check if property already exists
        prop = db.query(IntegrationProperty).filter(IntegrationProperty.organization_id == org.id).first()
        if not prop:
            prop = IntegrationProperty(
                organization_id=org.id,
                domain="www.zeroshield.ai",
                display_name="Main Corporate Site",
                property_type=PropertyType.website,
                environment=PropertyEnvironment.production,
                status=PropertyStatus.active,
                blocker_mode=BlockerMode.strict,
                auto_language=True,
                default_language="en",
                consent_framework="DPDPA",
                consent_duration_days=365,
            )
            db.add(prop)
            db.flush()
            print(f"Seeded property: {prop.domain}")
        else:
            print(f"Property already exists: {prop.domain}")
        
        # 2. Check if banner exists
        banner = db.query(ConsentBanner).filter(ConsentBanner.organization_id == org.id).first()
        if not banner:
            banner = ConsentBanner(
                organization_id=org.id,
                name="Global Cookie Compliance Banner",
                version="v1.0",
                status="Live",
                deployed_on=[{"type": "website", "label": "Web"}],
                languages=1,
                purposes=3,
                description="Production cookie consent banner for compliance.",
                banner_purpose_type=["cookie"],
                display_style="banner",
                position="bottom",
                theme="#4F46E5",
                template="classic",
                heading="We Value Your Privacy",
                body_text="We and our partners use cookies to process personal data, track site usage, and serve personalized ads. You can consent to all or customize your preferences below.",
                cta_accept="Accept All",
                cta_reject="Reject All",
                cta_customize="Customize",
                privacy_policy_url="https://www.zeroshield.ai/privacy",
                cookie_policy_url="https://www.zeroshield.ai/cookies",
                dpo_email="dpo@zeroshield.ai",
                show_language_switcher=True,
                properties=[str(prop.id)],
            )
            db.add(banner)
            db.flush()
            print(f"Seeded consent banner: {banner.name}")
        else:
            print(f"Consent banner already exists: {banner.name}")
            
        # 3. Check if container exists
        container = db.query(TagManagerContainer).filter(TagManagerContainer.organization_id == org.id).first()
        if not container:
            container = TagManagerContainer(
                organization_id=org.id,
                property_id=prop.id,
                provider="Google Tag Manager",
                container_name="Web GTM Container",
                container_identifier="GTM-ZS9876X",
                environment="production",
                status="active",
                auto_sync=True,
                consent_mode=True,
            )
            db.add(container)
            db.flush()
            print(f"Seeded GTM container: {container.container_identifier}")
            
            # Seed managed tags inside the container
            purposes = db.query(Purpose).filter(Purpose.organization_id == org.id).all()
            purpose_map = {p.name.lower(): p.id for p in purposes}
            
            tag1 = ManagedTag(
                container_id=container.id,
                property_id=prop.id,
                provider="Google Tag Manager",
                purpose_id=purpose_map.get("marketing email campaigns") or (purposes[0].id if purposes else None),
                tag_name="Google Analytics 4",
                trigger="All Pages",
                execution_type="External Script",
                script_url="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX",
                status="active",
                priority=10
            )
            
            tag2 = ManagedTag(
                container_id=container.id,
                property_id=prop.id,
                provider="Google Tag Manager",
                purpose_id=purpose_map.get("loyalty programme") or (purposes[0].id if purposes else None),
                tag_name="Meta Pixel",
                trigger="Custom Purchase Event",
                execution_type="Pixel",
                script_url="https://connect.facebook.net/en_US/fbevents.js",
                status="active",
                priority=20
            )
            
            tag3 = ManagedTag(
                container_id=container.id,
                property_id=prop.id,
                provider="Google Tag Manager",
                purpose_id=None,
                tag_name="Intercom Chat Support",
                trigger="Initialization",
                execution_type="Inline",
                inline_script="console.log('Intercom chat initialized');",
                status="active",
                priority=5
            )
            db.add_all([tag1, tag2, tag3])
            db.flush()
            print("Seeded managed tags for the GTM container.")
        else:
            print(f"GTM container already exists: {container.container_identifier}")
            
    except Exception as e:
        print(f"Warning: Could not seed banners and containers: {e}")

def run_seeding(admin_email: str, admin_password: str):
    try:
        from app.scripts.seed_production import main as seed_production_main
        seed_production_main(admin_email, admin_password)
    except Exception as e:
        print(f"Error during production seeding execution: {e}")

