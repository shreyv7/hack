import random
import uuid
import hashlib
from datetime import datetime, timezone, timedelta, date
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.organization import Organization, OrganizationStatus
from app.models.consent import ConsentNotice, ConsentNoticeVersion
from app.models.user import User
from app.models.notice_delivery import (
    NoticeCampaign,
    CampaignDelivery,
    DeliveryAttempt,
    DeliveryEvent,
    NoticeDeliveryProvider,
    ProviderCredential,
    RetryPolicy,
    DeliveryAnalyticsDaily,
    RecipientDeliveryStatus,
    NoticeCampaignActivity,
)


def seed_notice_campaigns():
    db = SessionLocal()
    try:
        org = (
            db.query(Organization)
            .filter(Organization.status == OrganizationStatus.active)
            .order_by(Organization.created_at)
            .first()
        )
        if org is None:
            print("No active organization found — skipping seed")
            return

        # Check if already seeded
        existing = db.query(NoticeCampaign).filter(NoticeCampaign.organization_id == org.id).count()
        if existing > 0:
            print("Notice campaigns already seeded — skipping seed")
            return

        print(f"Seeding Notice Campaigns for organization: {org.name}")

        user = db.query(User).filter(User.organization_id == org.id).first()
        user_id = user.id if user else None

        # Fetch seeded notice
        notice = db.query(ConsentNotice).filter(ConsentNotice.organization_id == org.id).first()
        if not notice:
            print("No consent notice found — create one first")
            return
            
        notice_ver = db.query(ConsentNoticeVersion).filter(ConsentNoticeVersion.notice_id == notice.id).first()
        notice_version_id = notice_ver.id if notice_ver else None

        now = datetime.now(timezone.utc)

        # 1. Seed Providers & credentials
        channels = [
            ("email", "Amazon SES", {"aws_access_key": "AKIA...", "aws_region": "ap-south-1"}),
            ("sms", "Twilio SMS", {"account_sid": "AC...", "auth_token": "token..."}),
            ("whatsapp", "Meta WhatsApp Business API", {"phone_number_id": "1098...", "access_token": "meta..."}),
            ("physical", "India Post SpeedPost", {"customer_id": "BNPL-450", "location_code": "DEL-110"}),
        ]
        
        provider_ids = {}
        for chan, name, config in channels:
            prov = NoticeDeliveryProvider(
                organization_id=org.id,
                channel=chan,
                provider_name=name,
                is_active=True
            )
            db.add(prov)
            db.flush()
            provider_ids[chan] = prov.id
            
            for key, val in config.items():
                cred = ProviderCredential(
                    provider_id=prov.id,
                    credential_key=key,
                    credential_value=val
                )
                db.add(cred)

        # 2. Seed Campaigns
        campaigns_data = [
            {
                "name": "Q2 Privacy Policy Update",
                "status": "completed",
                "strategy": "fallback",
                "fallback_chain": ["email", "sms", "whatsapp"],
                "segment": "all",
                "type": "immediate",
                "approved": True
            },
            {
                "name": "Health Data Notice",
                "status": "running",
                "strategy": "fallback",
                "fallback_chain": ["email", "sms", "whatsapp", "physical"],
                "segment": "high_risk",
                "type": "immediate",
                "approved": True
            },
            {
                "name": "Q3 Terms of Service Update",
                "status": "dpo_approval",
                "strategy": "email_only",
                "fallback_chain": [],
                "segment": "premium",
                "type": "scheduled",
                "approved": False
            },
            {
                "name": "Newsletter Consent Request",
                "status": "draft",
                "strategy": "whatsapp_only",
                "fallback_chain": [],
                "segment": "marketing",
                "type": "immediate",
                "approved": False
            }
        ]

        seeded_campaigns = []
        for idx, cd in enumerate(campaigns_data):
            campaign = NoticeCampaign(
                organization_id=org.id,
                name=cd["name"],
                notice_id=notice.id,
                notice_version_id=notice_version_id,
                status=cd["status"],
                delivery_strategy=cd["strategy"],
                fallback_chain=cd["fallback_chain"],
                recipient_segment=cd["segment"],
                schedule_type=cd["type"],
                schedule_config={"datetime": (now + timedelta(days=2)).isoformat(), "timezone": "Asia/Kolkata"} if cd["type"] == "scheduled" else {},
                created_by_user_id=user_id,
                approved_by_dpo_id=user_id if cd["approved"] else None,
                approved_at=now - timedelta(days=5) if cd["approved"] else None
            )
            db.add(campaign)
            db.flush()
            seeded_campaigns.append(campaign)

            # Retry Policy
            policy = RetryPolicy(
                campaign_id=campaign.id,
                max_attempts=3,
                backoff_seconds=300,
                timeout_seconds=30
            )
            db.add(policy)

            # Activities
            actions = ["campaign.created"]
            if cd["approved"]:
                actions.append("status.dpo_approval")
            actions.append(f"status.{cd['status']}")
            
            for act_name in actions:
                act = NoticeCampaignActivity(
                    campaign_id=campaign.id,
                    action=act_name,
                    actor_user_id=user_id,
                    actor_name="Shrey Admin",
                    details=f"Campaign transitioned or event logged: {act_name}"
                )
                db.add(act)

        # 3. Seed Deliveries & Attempts for "Q2 Privacy Policy Update" (Completed)
        completed_camp = seeded_campaigns[0]
        recipients = [
            {"id": "rec_01", "name": "Aarav Sharma", "email": "aarav.sharma@gmail.com", "phone": "+919988776655", "address": "12, MG Road, Bengaluru", "status": "acknowledged", "channel": "email"},
            {"id": "rec_02", "name": "Diya Patel", "email": "diya.patel@yahoo.com", "phone": "+919876543210", "address": "45, Ring Road, Ahmedabad", "status": "delivered", "channel": "email"},
            {"id": "rec_03", "name": "Kabir Verma (Minor)", "email": "kabir.verma@outlook.com", "phone": "+919444332211", "address": "78, Park Street, Kolkata", "status": "delivered", "channel": "sms"},
            {"id": "rec_04", "name": "Ananya Iyer", "email": "ananya.iyer@gmail.com", "phone": "+919111223344", "address": "3, Cathedral Road, Chennai", "status": "failed", "channel": "whatsapp"},
        ]

        for idx, r in enumerate(recipients):
            delivery = CampaignDelivery(
                campaign_id=completed_camp.id,
                recipient_id=r["id"],
                recipient_name=r["name"],
                recipient_email=r["email"],
                recipient_phone=r["phone"],
                recipient_address=r["address"],
                status=r["status"],
                current_channel=r["channel"],
                attempts_count=2 if r["status"] == "failed" else 1,
                last_attempt_at=now - timedelta(days=2),
                evidence_hash=hashlib.sha256(f"evidence-{r['id']}-{idx}".encode()).hexdigest(),
                proof_vault_ref=f"proof_ref_{r['id']}"
            )
            db.add(delivery)
            db.flush()

            # Attempt
            attempt = DeliveryAttempt(
                campaign_delivery_id=delivery.id,
                channel=r["channel"],
                provider_id=provider_ids.get(r["channel"]),
                status="delivered" if r["status"] in ["delivered", "acknowledged"] else "failed",
                attempt_number=1,
                sent_at=now - timedelta(days=2),
                response_payload={"message_id": f"msg-{str(delivery.id)[:8]}", "gateway_latency": "180ms"},
                error_message=None if r["status"] != "failed" else "Unknown mobile subscriber/timeout"
            )
            db.add(attempt)
            db.flush()

            if r["status"] == "failed":
                attempt2 = DeliveryAttempt(
                    campaign_delivery_id=delivery.id,
                    channel=r["channel"],
                    provider_id=provider_ids.get(r["channel"]),
                    status="failed",
                    attempt_number=2,
                    sent_at=now - timedelta(days=2) + timedelta(minutes=15),
                    response_payload={"message_id": f"msg-ret-{str(delivery.id)[:8]}"},
                    error_message="Recipient phone not registered on WhatsApp"
                )
                db.add(attempt2)
                db.flush()

            # Seed global acknowledgement cache for acknowledged user
            if r["status"] == "acknowledged":
                ack = RecipientDeliveryStatus(
                    recipient_id=r["id"],
                    notice_id=notice.id,
                    last_acknowledged_version_id=notice_version_id,
                    last_acknowledged_at=now - timedelta(days=1)
                )
                db.add(ack)

        # 4. Seed Daily Analytics Rollup summaries to feed high-fidelity widgets
        today = date.today()
        channels_totals = [
            ("email", "Amazon SES", 12450, 12108, 8234, 12108, 342, 1245.0),
            ("sms", "Twilio SMS", 8200, 8174, 0, 8174, 26, 2460.0),
            ("whatsapp", "Meta WhatsApp Business API", 4500, 4491, 4012, 4012, 9, 3600.0),
            ("physical", "India Post SpeedPost", 200, 145, 0, 145, 55, 6525.0)
        ]
        
        for ch, name, sent, deliv, opened, ack_cnt, fail, cost in channels_totals:
            rollup = DeliveryAnalyticsDaily(
                organization_id=org.id,
                date=today,
                campaign_id=completed_camp.id,
                channel=ch,
                provider=name,
                sent_count=sent,
                delivered_count=deliv,
                opened_count=opened,
                clicked_count=int(opened * 0.4) if opened > 0 else 0,
                acknowledged_count=ack_cnt,
                failed_count=fail,
                total_cost=cost
            )
            db.add(rollup)

        db.commit()
        print("Notice Campaigns seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding notice campaigns: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    seed_notice_campaigns()
