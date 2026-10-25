"""Consent Banner database model."""

from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class ConsentBanner(Base, BaseModel):
    __tablename__ = "consent_banners"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    version = Column(String(50), nullable=False, default="v1.0")
    status = Column(String(50), nullable=False, default="Draft")  # Draft | Live
    consents = Column(Integer, nullable=False, default=0)
    
    # Store list of platforms (deployedOn) as JSON, e.g. [{"type": "website", "label": "Web"}]
    deployed_on = Column(JSON, nullable=False, server_default="[]")
    
    # Configuration metadata
    languages = Column(Integer, nullable=False, default=1)
    purposes = Column(Integer, nullable=False, default=1)
    
    description = Column(String(500), nullable=True)

    # Internal reference only — not exposed on the public CMP widget
    # Stored as JSON list e.g. ["cookie", "marketing"] to support multiple selections
    banner_purpose_type = Column(JSON, nullable=False, server_default='["cookie"]')
    banner_purpose_custom = Column(String(500), nullable=True)
    display_style = Column(String(50), nullable=False, default="banner")  # banner | modal
    position = Column(String(50), nullable=False, default="bottom")  # bottom | top | center
    theme = Column(String(100), nullable=False, default="#4F46E5")
    template = Column(String(100), nullable=False, default="classic")
    heading = Column(String(255), nullable=True)
    body_text = Column(String(1000), nullable=True)
    cta_accept = Column(String(100), nullable=False, default="Accept All")
    cta_reject = Column(String(100), nullable=False, default="Reject All")
    cta_customize = Column(String(100), nullable=False, default="Customize")
    cta_withdraw = Column(String(100), nullable=True, default="Withdraw Consent")
    show_withdraw_action = Column(Boolean, nullable=False, default=False)
    
    # Privacy links
    privacy_policy_url = Column(String(500), nullable=True)
    cookie_policy_url = Column(String(500), nullable=True)
    dpo_email = Column(String(255), nullable=True)
    
    # Language switcher
    show_language_switcher = Column(Boolean, nullable=False, default=True)
    
    # A/B Testing
    ab_test_enabled = Column(Boolean, nullable=False, default=False)
    ab_variant_theme = Column(String(100), nullable=True)
    ab_variant_display_style = Column(String(50), nullable=True)
    ab_variant_position = Column(String(50), nullable=True)
    ab_variant_template = Column(String(100), nullable=True)
    ab_variant_custom_css = Column(String(2500), nullable=True)
    ab_traffic_split = Column(Integer, nullable=False, default=50)  # percentage for variant A
    ab_test_duration_days = Column(Integer, nullable=False, default=14)
    ab_test_started_at = Column(DateTime(timezone=True), nullable=True)
    
    # Developer Mode — expose window.Vajra programmatic API on the live site
    developer_mode = Column(Boolean, nullable=False, default=False)

    # Consent Persistence - duration choice
    consent_valid_days = Column(Integer, nullable=False, default=365)

    # Outbound webhook — POST consent events to customer infrastructure
    consent_webhook_url = Column(String(500), nullable=True)
    webhook_signing_secret = Column(String(128), nullable=True)
    webhook_subscribed_events = Column(JSON, nullable=True)
    webhook_bearer_token = Column(String(512), nullable=True)
    
    # Custom CSS
    custom_css = Column(String(2500), nullable=True)
    
    # Deployed properties
    properties = Column(JSON, nullable=False, server_default="[]")
    
    # Language auto-detection settings and pre-translated texts
    language_detection_settings = Column(JSON, nullable=True, server_default='{"browser": true, "geoip": true, "user_choice": true}')
    translations = Column(JSON, nullable=True, server_default='{}')
    archived_at = Column(DateTime(timezone=True), nullable=True)

    consent_notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
    consent_notice = relationship("ConsentNotice")


class ConsentActivity(Base, BaseModel):
    __tablename__ = "consent_activities"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    banner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_banners.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(100), nullable=False)  # Created banner, Content updated, Deployed to ..., Disconnected from ..., Archived, Unarchived
    banner_name = Column(String(255), nullable=False)
    banner_version = Column(String(50), nullable=False)
    user_name = Column(String(255), nullable=False)
    deployed_on = Column(JSON, nullable=False, server_default="[]")

    organization = relationship("Organization")
    banner = relationship("ConsentBanner")

