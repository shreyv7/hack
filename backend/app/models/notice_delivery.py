import enum

from sqlalchemy import Column, String, DateTime, ForeignKey, Integer, Boolean, Text, Date, Numeric, Enum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import BaseModel


class CampaignPurpose(str, enum.Enum):
    notice_delivery = "notice_delivery"
    consent_capture = "consent_capture"


class RecipientSource(str, enum.Enum):
    known_contacts = "known_contacts"
    csv_upload = "csv_upload"
    data_asset = "data_asset"


class ConsentDecisionStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    rejected = "rejected"
    customized = "customized"
    expired = "expired"


class CampaignRecipientUploadStatus(str, enum.Enum):
    uploaded = "uploaded"
    mapped = "mapped"
    validated = "validated"
    failed = "failed"


class NoticeCampaign(Base, BaseModel):
    __tablename__ = "notice_campaigns"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="CASCADE"),
        nullable=False,
    )
    notice_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notice_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    status = Column(String(50), nullable=False, default="draft")  # draft, legal_review, dpo_approval, scheduled, running, paused, completed, archived
    delivery_strategy = Column(String(50), nullable=False, default="email_only")  # email_only, sms_only, whatsapp_only, physical_only, parallel, fallback, smart
    fallback_chain = Column(JSONB, nullable=False, server_default="[]")  # e.g. ["email", "sms", "whatsapp"]
    recipient_segment = Column(String(100), nullable=False, default="all")  # all, marketing, premium, children, high_risk
    schedule_type = Column(String(50), nullable=False, default="immediate")  # immediate, scheduled, event_triggered
    schedule_config = Column(JSONB, nullable=False, server_default="{}")
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_by_dpo_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    approved_at = Column(DateTime(timezone=True), nullable=True)
    campaign_purpose = Column(
        String(50),
        nullable=False,
        default=CampaignPurpose.notice_delivery.value,
    )
    recipient_source = Column(String(50), nullable=True)
    recipient_source_config = Column(JSONB, nullable=False, server_default="{}")
    property_id = Column(
        UUID(as_uuid=True),
        ForeignKey("integration_properties.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    recipient_snapshot = Column(JSONB, nullable=True)

    organization = relationship("Organization")
    property = relationship("IntegrationProperty")
    notice = relationship("ConsentNotice")
    notice_version = relationship("ConsentNoticeVersion")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_dpo_id])


class CampaignDelivery(Base, BaseModel):
    __tablename__ = "campaign_deliveries"

    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_id = Column(String(255), nullable=False, index=True)
    recipient_name = Column(String(255), nullable=False)
    recipient_email = Column(String(255), nullable=True)
    recipient_phone = Column(String(50), nullable=True)
    recipient_address = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="pending")  # pending, sent, delivered, opened, clicked, acknowledged, failed, retrying
    current_channel = Column(String(50), nullable=False)  # email, sms, whatsapp, physical
    attempts_count = Column(Integer, nullable=False, default=0)
    last_attempt_at = Column(DateTime(timezone=True), nullable=True)
    evidence_hash = Column(String(64), nullable=True)
    proof_vault_ref = Column(String(255), nullable=True)
    delivery_token = Column(String(512), nullable=True, unique=True, index=True)
    capture_session_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_capture_sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    consent_decision = Column(
        String(50),
        nullable=False,
        default=ConsentDecisionStatus.pending.value,
    )
    consent_receipt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    campaign = relationship("NoticeCampaign", backref="deliveries")
    capture_session = relationship("ConsentCaptureSession", foreign_keys=[capture_session_id])
    consent_receipt = relationship("ConsentReceipt", foreign_keys=[consent_receipt_id])
    attempts = relationship("DeliveryAttempt", back_populates="delivery", cascade="all, delete-orphan")


class DeliveryAttempt(Base, BaseModel):
    __tablename__ = "delivery_attempts"

    campaign_delivery_id = Column(
        UUID(as_uuid=True),
        ForeignKey("campaign_deliveries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String(50), nullable=False)  # email, sms, whatsapp, physical
    provider_id = Column(
        UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String(50), nullable=False)  # sent, delivered, failed
    attempt_number = Column(Integer, nullable=False, default=1)
    sent_at = Column(DateTime(timezone=True), nullable=False)
    response_payload = Column(JSONB, nullable=False, server_default="{}")
    error_message = Column(Text, nullable=True)

    delivery = relationship("CampaignDelivery", back_populates="attempts")
    provider = relationship("NoticeDeliveryProvider")


class DeliveryEvent(Base, BaseModel):
    __tablename__ = "delivery_events"

    attempt_id = Column(
        UUID(as_uuid=True),
        ForeignKey("delivery_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type = Column(String(100), nullable=False)  # delivered, opened, clicked, bounced, retried
    payload = Column(JSONB, nullable=False, server_default="{}")
    occurred_at = Column(DateTime(timezone=True), nullable=False)

    attempt = relationship("DeliveryAttempt", backref="events")


class NoticeDeliveryProvider(Base, BaseModel):
    __tablename__ = "delivery_providers"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String(50), nullable=False)  # email, sms, whatsapp, physical
    provider_name = Column(String(255), nullable=False)  # Amazon SES, SMTP, Twilio, MSG91, Meta, India Post, BlueDart
    is_active = Column(Boolean, nullable=False, default=True)

    organization = relationship("Organization")
    credentials = relationship("ProviderCredential", back_populates="provider", cascade="all, delete-orphan")

    @property
    def config(self) -> dict[str, str]:
        from app.services.credential_encryption import decrypt_value
        return {cred.credential_key: decrypt_value(cred.credential_value) for cred in self.credentials}


class ProviderCredential(Base, BaseModel):
    __tablename__ = "provider_credentials"

    provider_id = Column(
        UUID(as_uuid=True),
        ForeignKey("delivery_providers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    credential_key = Column(String(100), nullable=False)
    credential_value = Column(String(1024), nullable=False)

    provider = relationship("NoticeDeliveryProvider", back_populates="credentials")


class DeliveryTemplate(Base, BaseModel):
    __tablename__ = "delivery_templates"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name = Column(String(255), nullable=False)
    template_type = Column(String(100), nullable=False)  # privacy_notice, consent_renewal, breach_notification, children_data, custom
    subject_format = Column(String(255), nullable=False)
    body_format = Column(Text, nullable=False)
    language = Column(String(10), nullable=False, default="en")

    organization = relationship("Organization")


class ScheduledJob(Base, BaseModel):
    __tablename__ = "scheduled_jobs"

    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    run_at = Column(DateTime(timezone=True), nullable=False, index=True)
    status = Column(String(50), nullable=False, default="queued")  # queued, running, completed, failed
    execution_log = Column(Text, nullable=True)

    campaign = relationship("NoticeCampaign")


class RetryPolicy(Base, BaseModel):
    __tablename__ = "retry_policies"

    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        unique=True,
    )
    max_attempts = Column(Integer, nullable=False, default=3)
    backoff_seconds = Column(Integer, nullable=False, default=300)
    timeout_seconds = Column(Integer, nullable=False, default=30)

    campaign = relationship("NoticeCampaign", backref="retry_policy_assoc")


class DeliveryAnalyticsDaily(Base, BaseModel):
    __tablename__ = "delivery_analytics_daily"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date = Column(Date, nullable=False, index=True)
    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel = Column(String(50), nullable=False)
    provider = Column(String(100), nullable=False)
    sent_count = Column(Integer, nullable=False, default=0)
    delivered_count = Column(Integer, nullable=False, default=0)
    opened_count = Column(Integer, nullable=False, default=0)
    clicked_count = Column(Integer, nullable=False, default=0)
    acknowledged_count = Column(Integer, nullable=False, default=0)
    failed_count = Column(Integer, nullable=False, default=0)
    total_cost = Column(Numeric(10, 2), nullable=False, default=0.00)

    organization = relationship("Organization")
    campaign = relationship("NoticeCampaign")


class RecipientDeliveryStatus(Base, BaseModel):
    __tablename__ = "recipient_delivery_status"

    recipient_id = Column(String(255), nullable=False, index=True)
    notice_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    last_acknowledged_version_id = Column(
        UUID(as_uuid=True),
        ForeignKey("consent_notice_versions.id", ondelete="CASCADE"),
        nullable=True,
    )
    last_acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    notice = relationship("ConsentNotice")
    last_acknowledged_version = relationship("ConsentNoticeVersion")


class NoticeCampaignActivity(Base, BaseModel):
    __tablename__ = "notice_campaign_activities"

    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    action = Column(String(100), nullable=False)  # created, approved, sent, completed, archived, etc.
    actor_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_name = Column(String(255), nullable=False, default="System")
    details = Column(Text, nullable=True)

    campaign = relationship("NoticeCampaign")


class CampaignRecipientUpload(Base, BaseModel):
    __tablename__ = "campaign_recipient_uploads"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    campaign_id = Column(
        UUID(as_uuid=True),
        ForeignKey("notice_campaigns.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    original_filename = Column(String(512), nullable=False)
    stored_path = Column(String(1024), nullable=False)
    column_headers = Column(JSONB, nullable=False, server_default="[]")
    field_map = Column(JSONB, nullable=False, server_default="{}")
    normalized_rows = Column(JSONB, nullable=True)
    row_count = Column(Integer, nullable=False, default=0)
    status = Column(
        String(50),
        nullable=False,
        default=CampaignRecipientUploadStatus.uploaded.value,
    )
    created_by_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    organization = relationship("Organization")
    campaign = relationship("NoticeCampaign")


class UserNotification(Base, BaseModel):
    __tablename__ = "user_notifications"

    organization_id = Column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    recipient_id = Column(String(255), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(50), nullable=False, default="system")
    action_url = Column(String(500), nullable=True)
    severity = Column(String(20), nullable=False, default="info")
    is_read = Column(Boolean, nullable=False, default=False)

    organization = relationship("Organization")

