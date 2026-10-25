"""BannerService for business operations."""

from uuid import UUID
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.models.consent_banner import ConsentBanner, ConsentActivity
from app.models.user import User
from app.schemas.consent_banner import BannerCreate
from app.services.consent_service import ConsentService
from app.services.consent_webhook_service import validate_webhook_url


import json

INDIAN_LANGUAGES = {
    "as": {"name": "Assamese", "native": "অসমীয়া"},
    "bn": {"name": "Bengali", "native": "বাংলা"},
    "brx": {"name": "Bodo", "native": "बर'"},
    "doi": {"name": "Dogri", "native": "डोगरी"},
    "gu": {"name": "Gujarati", "native": "ગુજરાતી"},
    "hi": {"name": "Hindi", "native": "हिन्दी"},
    "kn": {"name": "Kannada", "native": "ಕನ್ನಡ"},
    "ks": {"name": "Kashmiri", "native": "کٲشُر"},
    "kok": {"name": "Konkani", "native": "कोंकणी"},
    "mai": {"name": "Maithili", "native": "मैथिली"},
    "ml": {"name": "Malayalam", "native": "മലയാളം"},
    "mni": {"name": "Manipuri", "native": "মৈতৈলোন"},
    "mr": {"name": "Marathi", "native": "मराठी"},
    "ne": {"name": "Nepali", "native": "नेपाली"},
    "or": {"name": "Odia", "native": "ଓଡ଼ିଆ"},
    "pa": {"name": "Punjabi", "native": "ਪੰਜਾਬੀ"},
    "sa": {"name": "Sanskrit", "native": "संस्कृतम्"},
    "sat": {"name": "Santali", "native": "ᱥᱟᱱᱛᱟᱲᱤ"},
    "sd": {"name": "Sindhi", "native": "سنڌي"},
    "ta": {"name": "Tamil", "native": "தமிழ்"},
    "te": {"name": "Telugu", "native": "తెలుగు"},
    "ur": {"name": "Urdu", "native": "اردו"}
}





class BannerService:
    def __init__(self, db: Session):
        self.db = db
        self.consent_service = ConsentService(db)

    def log_activity(
        self,
        user: User,
        banner: ConsentBanner,
        action: str,
        deployed_on: list[dict] = []
    ) -> ConsentActivity:
        activity = ConsentActivity(
            organization_id=banner.organization_id,
            banner_id=banner.id,
            action=action,
            banner_name=banner.name,
            banner_version=banner.version,
            user_name=user.full_name or user.email or "System",
            deployed_on=deployed_on
        )
        self.db.add(activity)
        self.db.commit()
        return activity

    def list_banners(self, user: User, org_id: UUID | None = None, include_archived: bool = False) -> list[ConsentBanner]:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        q = self.db.query(ConsentBanner).filter(ConsentBanner.organization_id == resolved_org_id)
        if not include_archived:
            q = q.filter(ConsentBanner.archived_at.is_(None))
        return q.order_by(ConsentBanner.name).all()

    def get_banner(self, user: User, banner_id: UUID, org_id: UUID | None = None) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")
        return banner

    def create_banner(
        self, user: User, body: BannerCreate, org_id: UUID | None = None
    ) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)

        try:
            webhook_url = validate_webhook_url(body.consent_webhook_url)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        translations = body.translations or {}

        settings = body.language_detection_settings
        if not settings:
            settings = {"browser": True, "geoip": True, "user_choice": True}
        elif isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                settings = {"browser": True, "geoip": True, "user_choice": True}

        banner = ConsentBanner(
            organization_id=resolved_org_id,
            name=body.name.strip(),
            version=body.version,
            status=body.status,
            consents=body.consents,
            deployed_on=body.deployed_on,
            languages=body.languages,
            purposes=body.purposes,
            description=body.description,
            banner_purpose_type=body.banner_purpose_type if isinstance(body.banner_purpose_type, list) and body.banner_purpose_type else ["cookie"],
            banner_purpose_custom=body.banner_purpose_custom,
            display_style=body.display_style,
            position=body.position,
            theme=body.theme,
            template=body.template,
            heading=body.heading,
            body_text=body.body_text,
            cta_accept=body.cta_accept,
            cta_reject=body.cta_reject,
            cta_customize=body.cta_customize,
            cta_withdraw=body.cta_withdraw,
            show_withdraw_action=body.show_withdraw_action,
            privacy_policy_url=body.privacy_policy_url,
            cookie_policy_url=body.cookie_policy_url,
            dpo_email=body.dpo_email,
            show_language_switcher=body.show_language_switcher,
            ab_test_enabled=body.ab_test_enabled,
            ab_variant_theme=body.ab_variant_theme,
            ab_variant_display_style=body.ab_variant_display_style,
            ab_variant_position=body.ab_variant_position,
            ab_variant_template=body.ab_variant_template,
            ab_variant_custom_css=body.ab_variant_custom_css,
            ab_traffic_split=body.ab_traffic_split,
            ab_test_duration_days=body.ab_test_duration_days,
            ab_test_started_at=datetime.now(timezone.utc) if body.ab_test_enabled else None,
            developer_mode=body.developer_mode,
            consent_webhook_url=webhook_url,
            custom_css=body.custom_css,
            properties=body.properties,
            language_detection_settings=settings,
            translations=translations,
            consent_notice_id=body.consent_notice_id,
        )
        self.db.add(banner)
        self.db.commit()
        self.db.refresh(banner)
        self.log_activity(user, banner, "Created banner")
        return banner

    def update_banner(
        self, user: User, banner_id: UUID, body: BannerCreate, org_id: UUID | None = None
    ) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)

        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id
        ).first()

        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")

        try:
            webhook_url = validate_webhook_url(body.consent_webhook_url)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        # Increment version
        current_version = banner.version or "v1.0"
        try:
            if current_version.startswith("v"):
                ver_num = float(current_version[1:])
                new_version = f"v{ver_num + 0.1:.1f}"
            else:
                ver_num = float(current_version)
                new_version = f"{ver_num + 0.1:.1f}"
        except ValueError:
            new_version = "v1.1"

        translations = body.translations if body.translations is not None else banner.translations
        if translations is None:
            translations = {}

        settings = body.language_detection_settings
        if not settings:
            settings = {"browser": True, "geoip": True, "user_choice": True}
        elif isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except Exception:
                settings = {"browser": True, "geoip": True, "user_choice": True}

        banner.version = new_version
        banner.name = body.name.strip()
        banner.status = body.status
        banner.consents = body.consents
        banner.deployed_on = body.deployed_on
        banner.languages = body.languages
        banner.purposes = body.purposes
        banner.description = body.description
        banner.banner_purpose_type = body.banner_purpose_type if isinstance(body.banner_purpose_type, list) and body.banner_purpose_type else ["cookie"]
        banner.banner_purpose_custom = body.banner_purpose_custom
        banner.display_style = body.display_style
        banner.position = body.position
        banner.theme = body.theme
        banner.template = body.template
        banner.heading = body.heading
        banner.body_text = body.body_text
        banner.cta_accept = body.cta_accept
        banner.cta_reject = body.cta_reject
        banner.cta_customize = body.cta_customize
        banner.cta_withdraw = body.cta_withdraw
        banner.show_withdraw_action = body.show_withdraw_action
        banner.privacy_policy_url = body.privacy_policy_url
        banner.cookie_policy_url = body.cookie_policy_url
        banner.dpo_email = body.dpo_email
        banner.show_language_switcher = body.show_language_switcher
        banner.ab_test_enabled = body.ab_test_enabled
        banner.ab_variant_theme = body.ab_variant_theme
        banner.ab_variant_display_style = body.ab_variant_display_style
        banner.ab_variant_position = body.ab_variant_position
        banner.ab_variant_template = body.ab_variant_template
        banner.ab_variant_custom_css = body.ab_variant_custom_css
        banner.ab_traffic_split = body.ab_traffic_split
        banner.ab_test_duration_days = body.ab_test_duration_days
        if body.ab_test_enabled and not banner.ab_test_started_at:
            from datetime import datetime, timezone

            banner.ab_test_started_at = datetime.now(timezone.utc)
        if not body.ab_test_enabled:
            banner.ab_test_started_at = None
        banner.developer_mode = body.developer_mode
        banner.consent_webhook_url = webhook_url
        banner.custom_css = body.custom_css
        banner.properties = body.properties
        banner.language_detection_settings = settings
        banner.translations = translations
        banner.consent_notice_id = body.consent_notice_id

        self.db.commit()
        self.db.refresh(banner)
        self.log_activity(user, banner, "Content updated")
        return banner

    def set_webhook_url(
        self,
        user: User,
        banner_id: UUID,
        url: str | None,
        org_id: UUID | None = None,
    ) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)

        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id,
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")

        try:
            webhook_url = validate_webhook_url(url)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

        banner.consent_webhook_url = webhook_url
        self.db.commit()
        self.db.refresh(banner)
        self.log_activity(user, banner, "Webhook URL updated")
        return banner

    def set_webhook_config(
        self,
        user: User,
        banner_id: UUID,
        *,
        url: str | None = None,
        signing_secret: str | None = None,
        subscribed_events: list[str] | None = None,
        bearer_token: str | None = None,
        org_id: UUID | None = None,
    ) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)

        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id,
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")

        if url is not None:
            try:
                banner.consent_webhook_url = validate_webhook_url(url)
            except ValueError as exc:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        if signing_secret is not None:
            banner.webhook_signing_secret = signing_secret.strip() or None
        if subscribed_events is not None:
            banner.webhook_subscribed_events = subscribed_events or None
        if bearer_token is not None:
            banner.webhook_bearer_token = bearer_token.strip() or None

        self.db.commit()
        self.db.refresh(banner)
        self.log_activity(user, banner, "Webhook configuration updated")
        return banner

    def archive_banner(self, user: User, banner_id: UUID, org_id: UUID | None = None) -> None:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)
        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")
            
        # Check if the banner is active on any property
        from app.models.property_banner_association import PropertyBannerAssociation
        active_links = self.db.query(PropertyBannerAssociation).filter(
            PropertyBannerAssociation.banner_id == banner_id,
            PropertyBannerAssociation.status == "active"
        ).count()
        if active_links:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="Cannot archive banner actively deployed to a property",
            )
            
        banner.archived_at = datetime.now(timezone.utc)
        self.db.commit()
        self.log_activity(user, banner, "Archived banner")

    def unarchive_banner(self, user: User, banner_id: UUID, org_id: UUID | None = None) -> ConsentBanner:
        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        self.consent_service._require_admin(user)
        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")
        banner.archived_at = None
        self.db.commit()
        self.db.refresh(banner)
        self.log_activity(user, banner, "Unarchived banner")
        return banner

    def get_ab_summary(
        self, user: User, banner_id: UUID, org_id: UUID | None = None
    ) -> dict:
        from app.models.integration_event import IntegrationEvent

        resolved_org_id = self.consent_service._resolve_org_id(user, org_id)
        banner = self.db.query(ConsentBanner).filter(
            ConsentBanner.id == banner_id,
            ConsentBanner.organization_id == resolved_org_id,
        ).first()
        if not banner:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Banner not found")

        variant_a = 0
        variant_b = 0
        concluded = 0
        converted = 0
        events = (
            self.db.query(IntegrationEvent)
            .filter(
                IntegrationEvent.event_type.in_(
                    ("ab_variant_assigned", "ab_test_concluded", "ab_variant_converted")
                ),
                IntegrationEvent.payload["banner_id"].astext == str(banner_id),
            )
            .all()
        )
        for event in events:
            payload = event.payload or {}
            if event.event_type == "ab_variant_assigned":
                if payload.get("variant") == "B":
                    variant_b += 1
                else:
                    variant_a += 1
            elif event.event_type == "ab_test_concluded":
                concluded += 1
            elif event.event_type == "ab_variant_converted":
                converted += 1

        return {
            "banner_id": str(banner_id),
            "ab_test_enabled": banner.ab_test_enabled,
            "ab_test_started_at": banner.ab_test_started_at.isoformat() if banner.ab_test_started_at else None,
            "ab_test_duration_days": banner.ab_test_duration_days,
            "assigned_variant_a": variant_a,
            "assigned_variant_b": variant_b,
            "concluded_sessions": concluded,
            "conversions": converted,
        }

