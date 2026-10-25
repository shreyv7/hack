from datetime import date
from uuid import UUID
from sqlalchemy.orm import Session
from app.models.notice_delivery import DeliveryAnalyticsDaily


class ComplianceContract:
    @staticmethod
    def publish_metrics_rollup(
        db: Session,
        org_id: UUID,
        campaign_id: UUID,
        channel: str,
        provider: str,
        metrics: dict[str, int],
        cost: float = 0.0
    ) -> None:
        today = date.today()
        
        # Check if record already exists for today
        analytics = db.query(DeliveryAnalyticsDaily).filter(
            DeliveryAnalyticsDaily.organization_id == org_id,
            DeliveryAnalyticsDaily.date == today,
            DeliveryAnalyticsDaily.campaign_id == campaign_id,
            DeliveryAnalyticsDaily.channel == channel,
            DeliveryAnalyticsDaily.provider == provider
        ).first()
        
        if not analytics:
            analytics = DeliveryAnalyticsDaily(
                organization_id=org_id,
                date=today,
                campaign_id=campaign_id,
                channel=channel,
                provider=provider,
                sent_count=metrics.get("sent", 0),
                delivered_count=metrics.get("delivered", 0),
                opened_count=metrics.get("opened", 0),
                clicked_count=metrics.get("clicked", 0),
                acknowledged_count=metrics.get("acknowledged", 0),
                failed_count=metrics.get("failed", 0),
                total_cost=cost
            )
            db.add(analytics)
        else:
            analytics.sent_count += metrics.get("sent", 0)
            analytics.delivered_count += metrics.get("delivered", 0)
            analytics.opened_count += metrics.get("opened", 0)
            analytics.clicked_count += metrics.get("clicked", 0)
            analytics.acknowledged_count += metrics.get("acknowledged", 0)
            analytics.failed_count += metrics.get("failed", 0)
            analytics.total_cost += cost
            
        db.commit()
